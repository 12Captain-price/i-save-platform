"""Encrypted consistent PostgreSQL + in-database private-storage archives.

No Docker socket, public downloads, live restore or plaintext archive on disk.
The restore server must be a different PostgreSQL cluster and host.
"""
import hashlib
import json
import os
from pathlib import Path
import resource
import secrets
import struct
import subprocess
import tempfile
from uuid import uuid4
import psycopg
from psycopg import sql
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import get_settings
from app.database import engine
from app.models.operations import BackupJob
from app.security.auth import now, aware
from app.services import operations

MAGIC=b'ISAVE-BACKUP-1\0'


def key():
    value=Path(get_settings().backup_key_file).read_bytes()
    if len(value)!=32:raise ValueError('Key unavailable')
    return value


def seal(payload,secret):
    nonce=secrets.token_bytes(12)
    return MAGIC+nonce+AESGCM(secret).encrypt(nonce,payload,MAGIC)


def unseal(payload,secret):
    if not payload.startswith(MAGIC):raise ValueError('Archive format')
    n=len(MAGIC)
    return AESGCM(secret).decrypt(payload[n:n+12],payload[n+12:],MAGIC)


def inventory(connection):
    result={'tables':{},'documents':{},'sequences':{}}
    for name in connection.execute(text("select tablename from pg_tables where schemaname='public' order by tablename")).scalars():
        quoted=connection.dialect.identifier_preparer.quote(name)
        rows=sorted(connection.execute(text('select row_to_json(t)::text from '+quoted+' t')).scalars())
        result['tables'][name]={'rows':len(rows),'sha256':hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
    for identifier,content,expected in connection.execute(text('select id,content,sha256 from application_evidence order by id')):
        digest=hashlib.sha256(bytes(content)).hexdigest()
        if content and digest!=expected:raise ValueError('Document integrity mismatch')
        result['documents'][str(identifier)]={'bytes':len(content),'sha256':digest,'retained_original_sha256':expected}
    for name,value in connection.execute(text("select sequencename,last_value from pg_sequences where schemaname='public' order by sequencename")):result['sequences'][name]=value
    return result


def pg_environment(url):
    url=make_url(url)
    return {**os.environ,'PGHOST':url.host or '', 'PGPORT':str(url.port or 5432),'PGDATABASE':url.database or '', 'PGUSER':url.username or '', 'PGPASSWORD':url.password or '', 'PGCONNECT_TIMEOUT':'10','PGOPTIONS':'-c timezone=UTC'}


def command(args,url,input=None):
    # Anonymous tmpfs files; no plaintext dump in persistent storage or logs.
    limit=get_settings().backup_max_bytes
    def bounded():resource.setrlimit(resource.RLIMIT_FSIZE,(limit,limit))
    with tempfile.TemporaryFile(dir='/dev/shm') as output:
        subprocess.run(args,input=input,stdout=output,stderr=subprocess.DEVNULL,env=pg_environment(url),timeout=180,check=True,preexec_fn=bounded)
        if output.tell()>limit:raise ValueError('Local archive limit')
        output.seek(0);return output.read(limit+1)


def archive_path(identifier):
    root=Path(get_settings().backup_directory)
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    return root/('backup-'+str(int(identifier))+'.isave')


def create_backup(identifier,source_engine=engine):
    secret=key();limit=get_settings().backup_max_bytes
    with source_engine.connect().execution_options(isolation_level='REPEATABLE READ') as connection:
        connection.execute(text('SET TRANSACTION READ ONLY'));connection.execute(text("SET TIME ZONE 'UTC'"))
        snapshot=connection.execute(text('select pg_export_snapshot()')).scalar()
        manifest={'format':1,'created_at':now().isoformat(),'storage':'PostgreSQL bytea; includes original private evidence','database':source_engine.url.database,'inventory':inventory(connection)}
        dump=command(['pg_dump','-Fc','--no-owner','--no-acl','--snapshot='+snapshot],source_engine.url)
    manifest['dump_sha256']=hashlib.sha256(dump).hexdigest()
    header=json.dumps(manifest,sort_keys=True).encode()
    payload=struct.pack('!I',len(header))+header+dump
    if len(payload)>limit:raise ValueError('Local archive limit')
    encrypted=seal(payload,secret);destination=archive_path(identifier)
    # Exclusive create prevents retries from replacing an already written archive.
    with destination.open('xb') as file:
        os.chmod(destination,0o600);file.write(encrypted);file.flush();os.fsync(file.fileno())
    return hashlib.sha256(encrypted).hexdigest(),len(encrypted)


def restore_test(job,source_engine=engine):
    config=get_settings();url=make_url(config.restore_test_url)
    if not url.database or url.database!='postgres' or not url.host or url.host==source_engine.url.host:raise ValueError('Restore isolation unavailable')
    control=create_engine(url)
    try:
        with source_engine.connect() as source,control.connect() as target:
            if source.execute(text('select system_identifier from pg_control_system()')).scalar()==target.execute(text('select system_identifier from pg_control_system()')).scalar():raise ValueError('Restore cluster is not independent')
        file=archive_path(job.backup_id)
        if file.stat().st_size>config.backup_max_bytes+1024*1024:raise ValueError('Archive limit')
        encrypted=file.read_bytes()
        with Session(source_engine) as db:
            backup=db.get(BackupJob,job.backup_id)
            if not backup or backup.state!='Succeeded' or backup.checksum!=hashlib.sha256(encrypted).hexdigest():raise ValueError('Archive checksum mismatch')
        payload=unseal(encrypted,key());length=struct.unpack('!I',payload[:4])[0]
        if length>len(payload)-4:raise ValueError('Manifest format')
        manifest=json.loads(payload[4:4+length]);dump=payload[4+length:]
        if manifest['dump_sha256']!=hashlib.sha256(dump).hexdigest():raise ValueError('Dump checksum mismatch')
        name='isave_restore_'+str(job.id)+'_'+uuid4().hex[:12]
        with psycopg.connect(**{k:v for k,v in {'host':url.host,'port':url.port or 5432,'user':url.username,'password':url.password,'dbname':'postgres'}.items() if v is not None},autocommit=True) as c:c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        target_url=url.set(database=name)
        command(['pg_restore','--no-owner','--no-acl','--exit-on-error','--dbname='+name],target_url,dump)
        restored=create_engine(target_url)
        try:
            with restored.connect() as c:
                c.execute(text("SET TIME ZONE 'UTC'"))
                actual=inventory(c);expected=manifest['inventory']
                if actual['tables']!=expected['tables'] or actual['documents']!=expected['documents']:raise ValueError('Restored records or documents differ')
                # Sequences are not MVCC: concurrent inserts can advance values
                # after export. Gaps are safe; regressions behind the snapshot are not.
                if any(v is not None and (actual['sequences'].get(k) or 0)<v for k,v in expected['sequences'].items()):raise ValueError('Restored sequence regressed')
        finally:restored.dispose()
        # Target retained for controlled operator inspection. Never overwrite/drop it.
        return name
    finally:control.dispose()


def schedule(db):
    _,terms=operations.active(db);hours=terms['backup_interval_hours']
    if not hours:return False
    from datetime import timedelta
    from app.services.membership import advisory
    advisory(db,'backup-queue')
    latest=db.query(BackupJob).filter_by(kind='backup').order_by(BackupJob.id.desc()).first()
    if latest and aware(latest.recorded_at)+timedelta(hours=hours)>now():return False
    from app.schemas.operations import Job
    operations.queue(db,None,Job(request_key=uuid4(),kind='backup',confirm=True));db.commit();return True


def process_one(source_engine=engine):
    # Session-level lock held across committed claim, dump and restore. No blind
    # replay of a crash after archive creation. Different workers serialize.
    with source_engine.connect() as guard:
        if not guard.execute(text('SELECT pg_try_advisory_lock(182018)')).scalar():return False
        try:
            with Session(source_engine) as db:
                for stale in db.query(BackupJob).filter_by(state='Running'):
                    stale.state='Interrupted';stale.reason='Worker interrupted; inspect preserved archive before a new request.';stale.finished_at=now()
                    operations.event(db,None,'backup_interrupted',stale.id,{},'interrupted:'+str(stale.id))
                db.commit();schedule(db)
                job=db.query(BackupJob).filter_by(state='Queued').order_by(BackupJob.id).with_for_update().first()
                if not job:return False
                job.state='Running';db.commit()
                try:
                    if job.kind=='backup':job.checksum,job.size=create_backup(job.id,source_engine)
                    else:
                        target=restore_test(job,source_engine)
                        operations.event(db,None,'restore_verified',job.id,{'isolated_target':target,'database_and_documents_match':True},'restored:'+str(job.id))
                    job.state='Succeeded';job.reason='Encrypted local archive verified' if job.kind=='backup' else 'Independent restore records and document checksums match'
                except Exception:
                    db.rollback();job=db.get(BackupJob,job.id);job.state='Failed';job.reason='Operation failed safely. Authorised operator must check key, storage, capacity, database tools and isolated target; no live restore occurred.'
                job.finished_at=now();operations.event(db,None,'backup_result',job.id,{'state':job.state,'kind':job.kind},'result:'+str(job.id));db.commit();return job.state
        finally:guard.execute(text('SELECT pg_advisory_unlock(182018)'));guard.commit()

"""Explicit PostgreSQL provisioning; never invoked by application startup.

Run with a privately supplied administrative DSN. No passwords are accepted as
arguments or generated here. Existing credentials and unrelated roles survive.
"""
import argparse
import json
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

OWNER = 'isave_owner'
PURPOSES = {
    'api': 'isave_api', 'account': 'isave_account_worker',
    'subscriptions': 'isave_subscription_worker',
    'operations': 'isave_operations_worker', 'backup': 'isave_backup_reader',
}
MIGRATOR = 'isave_migrator'
MARKER = 'i-Save database identity v1'
# INSERT-only history; mutable workflow rows deliberately remain distinct.
APPEND_ONLY = {
    'audit_events', 'application_events', 'application_submissions',
    'savings_interests', 'plan_draft_versions',
    'business_settings_versions', 'business_settings_publications',
    'application_settings_snapshots', 'subscription_settings_snapshots',
    'fee_rate_versions', 'fee_rate_publications', 'fee_obligations',
    'evidence_reviews', 'plan_approvals', 'plan_publications',
    'plan_application_events', 'savings_events', 'savings_ledger_entries',
    'withdrawal_events', 'withdrawal_debits', 'content_versions', 'content_events',
    'ticket_events', 'ticket_messages', 'marketing_consent_events',
    'campaign_versions', 'campaign_events', 'campaign_delivery_events',
    'operations_policies', 'operations_events',
}
# Read-only fixture promotion gate needs these metadata tables in every worker.
INVENTORY_READ = {
    'users', 'audit_events', 'membership_applications', 'members',
    'business_settings_versions', 'business_settings_publications',
    'plan_draft_versions', 'plan_publications', 'fee_rate_versions', 'fee_rate_publications',
    'alembic_version',
}
ACCOUNT_READ = INVENTORY_READ | {
    'roles', 'permissions', 'role_permissions', 'user_permissions', 'account_links',
    'recovery_requests', 'campaigns', 'campaign_versions', 'campaign_recipients',
    'campaign_delivery_events', 'campaign_unsubscribe_links', 'marketing_preferences',
    'content_versions', 'content_items', 'content_events', 'public_media',
}
WRITES = {
    'account': {
        'account_links': {'INSERT', 'WORKER_UPDATE'}, 'recovery_requests': {'WORKER_UPDATE'},
        'campaigns': {'WORKER_UPDATE'}, 'campaign_recipients': {'WORKER_UPDATE'},
        'campaign_delivery_events': {'INSERT'}, 'campaign_unsubscribe_links': {'INSERT'},
        'audit_events': {'INSERT'},
        # PostgreSQL SELECT FOR UPDATE needs UPDATE on at least one column.
        'users': {'LOCK'}, 'content_items': {'LOCK'},
    },
    'subscriptions': {
        'subscriptions': {'INSERT'}, 'subscription_settings_snapshots': {'INSERT'},
        'fee_obligations': {'INSERT'}, 'audit_events': {'INSERT'},
    },
    'operations': {'backup_jobs': {'INSERT', 'JOB_UPDATE'}, 'operations_events': {'INSERT'}},
    'backup': {},
}
READS = {
    'account': ACCOUNT_READ,
    'subscriptions': INVENTORY_READ | {'membership_approvals', 'subscriptions', 'fee_obligations'},
    'operations': INVENTORY_READ | {'backup_jobs', 'operations_events', 'operations_policies'},
}
COLUMN_READS = {
    p: {'users': {'id','email'}, 'members': {'id','email','member_number'},
        'membership_applications': {'id','email'}} for p in ('subscriptions','operations')
}
for _purpose in ('account','subscriptions','operations'):
    COLUMN_READS.setdefault(_purpose,{})['audit_events'] = (
        {'id','event_type','created_at','updated_at'} if _purpose!='operations' else {'id','event_type'})
UPDATE_COLUMNS = {
    'account': {'users': {'id'},'content_items': {'id'},
        'account_links': {'revoked_at','delivery_state'},
        'recovery_requests': {'state'}, 'campaigns': {'state'},
        'campaign_recipients': {'state','attempts','attempted_at','reason'}},
    'operations': {'backup_jobs': {'state','reason','checksum','size','finished_at'}},
}


def quote(c, name):
    return c.dialect.identifier_preparer.quote_identifier(name)


def require_postgres(c):
    if c.dialect.name != 'postgresql':
        raise RuntimeError('Database role operations require PostgreSQL')


def privilege_plan(tables, purpose):
    reads = set(tables) if purpose in {'api', 'backup'} else READS[purpose]
    writes = ({t: ({'INSERT'} if t in APPEND_ONLY else {'INSERT', 'UPDATE'})
               for t in tables if t != 'alembic_version'} if purpose == 'api' else WRITES[purpose])
    if purpose == 'api':
        writes['backup_jobs']={'INSERT'}
        for t in ('user_permissions', 'members'):
            if t in writes: writes[t] = writes[t] | {'DELETE'}
    return (reads & set(tables))-set(COLUMN_READS.get(purpose,{})), writes


def inspect_access(c):
    """Safe inventory: no DSNs, role passwords, rows or statement parameters."""
    require_postgres(c)
    return {
        'identity': dict(c.execute(text("SELECT current_database() AS database, current_user AS role")).mappings().one()),
        'roles': [dict(r) for r in c.execute(text("SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname=current_user OR rolname LIKE 'isave_%' ORDER BY rolname")).mappings()],
        'owners': [dict(r) for r in c.execute(text("SELECT c.relname,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S') ORDER BY c.relname")).mappings()],
        'audit_triggers': [dict(r) for r in c.execute(text("SELECT t.tgname,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='audit_events' AND NOT t.tgisinternal")).mappings()],
        'memberships': [dict(r) for r in c.execute(text("SELECT parent.rolname AS granted_role,child.rolname AS member,m.admin_option FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member WHERE parent.rolname LIKE 'isave_%' OR child.rolname LIKE 'isave_%' OR child.rolname=current_user ORDER BY parent.rolname,child.rolname")).mappings()],
        'table_grants': [dict(r) for r in c.execute(text("SELECT grantee,table_name,privilege_type,is_grantable FROM information_schema.role_table_grants WHERE table_schema='public' AND (grantee LIKE 'isave_%' OR grantee=current_user OR grantee='PUBLIC') ORDER BY grantee,table_name,privilege_type")).mappings()],
        'schema_acl': [dict(r) for r in c.execute(text("SELECT nspname,nspacl::text FROM pg_namespace WHERE nspname='public'")).mappings()],
    }


def verify(c, purpose):
    """Check effective privileges, including indirect grants; no role switching."""
    require_postgres(c)
    if purpose not in PURPOSES: raise ValueError('Unknown database purpose')
    expected = PURPOSES[purpose]
    role = c.execute(text('SELECT current_user')).scalar_one()
    problems = []
    if role != expected: problems.append('Unexpected login role')
    if c.execute(text("SELECT current_setting('TimeZone')")).scalar()!='UTC': problems.append('Database sessions must use UTC')
    if c.execute(text('SELECT session_user<>current_user')).scalar(): problems.append('Runtime must authenticate directly, not SET ROLE from a privileged login')
    unsafe = c.execute(text("SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR rolinherit FROM pg_roles WHERE rolname=current_user")).scalar_one()
    if unsafe: problems.append('Privileged role attributes')
    if c.execute(text("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname<>current_user AND pg_has_role(current_user,oid,'MEMBER'))")).scalar():
        problems.append('Unexpected role membership')
    if c.execute(text("SELECT has_database_privilege(current_database(),'CREATE') OR has_database_privilege(current_database(),'TEMP')")).scalar():
        problems.append('Database creation or temporary-object privilege')
    if c.execute(text("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' AND has_schema_privilege(oid,'CREATE'))")).scalar():
        problems.append('Writable schema')
    if c.execute(text("SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_get_userbyid(c.relowner)=current_user)")).scalar():
        problems.append('Runtime owns application objects')
    if c.execute(text("SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND pg_get_userbyid(p.proowner)=current_user)")).scalar():
        problems.append('Runtime owns application functions')
    tables = inspect(c).get_table_names(schema='public')
    reads, writes = privilege_plan(tables, purpose)
    for table in tables:
        effective = c.execute(text("SELECT p FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege(current_user,:table,p)"), {'table':'public.'+table}).scalars().all()
        allowed = ({'SELECT'} if table in reads else set()) | (writes.get(table, set())-{'LOCK','JOB_UPDATE','WORKER_UPDATE'})
        if set(effective) != allowed: problems.append('Table privilege mismatch: '+table)
        if c.execute(text("SELECT EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege(current_user,:t,p||' WITH GRANT OPTION'))"),{'t':'public.'+table}).scalar():
            problems.append('Unexpected delegation privilege: '+table)
        if table in COLUMN_READS.get(purpose,{}):
            actual=set(c.execute(text("SELECT attname FROM pg_attribute WHERE attrelid=to_regclass(:t) AND attnum>0 AND NOT attisdropped AND has_column_privilege(current_user,attrelid,attnum,'SELECT')"),{'t':'public.'+table}).scalars())
            if actual!=COLUMN_READS[purpose][table]: problems.append('Metadata column privilege mismatch: '+table)
        # Column grants can bypass a revoked table grant.
        for action in ('INSERT','UPDATE','REFERENCES'):
            if action not in allowed and c.execute(text('SELECT has_any_column_privilege(current_user,:t,:p)'),{'t':'public.'+table,'p':action}).scalar():
                columns=UPDATE_COLUMNS.get(purpose,{}).get(table)
                if not (action=='UPDATE' and columns):
                    problems.append('Unexpected column grant: '+table)
                else:
                    actual=set(c.execute(text("SELECT attname FROM pg_attribute WHERE attrelid=to_regclass(:t) AND attnum>0 AND NOT attisdropped AND has_column_privilege(current_user,attrelid,attnum,'UPDATE')"),{'t':'public.'+table}).scalars())
                    if actual!=columns: problems.append('Unexpected update-column grant: '+table)
    for sequence in c.execute(text("SELECT sequencename FROM pg_sequences WHERE schemaname='public'")).scalars():
        if c.execute(text("SELECT has_sequence_privilege(current_user,:s,'UPDATE') OR has_sequence_privilege(current_user,:s,'USAGE WITH GRANT OPTION') OR has_sequence_privilege(current_user,:s,'SELECT WITH GRANT OPTION')"),{'s':'public.'+sequence}).scalar():
            problems.append('Unexpected sequence mutation or delegation: '+sequence)
        if purpose=='backup' and c.execute(text("SELECT has_sequence_privilege(current_user,:s,'USAGE')"),{'s':'public.'+sequence}).scalar():
            problems.append('Backup role can advance sequence: '+sequence)
    triggers = set(c.execute(text("SELECT tgname FROM pg_trigger WHERE tgrelid='public.audit_events'::regclass AND tgenabled='A'")).scalars())
    if not {'audit_events_no_mutation','audit_events_no_truncate','audit_events_worker_scope'} <= triggers:
        problems.append('Audit protections absent or not ALWAYS enabled')
    if not c.execute(text("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.operations_events'::regclass AND tgname='operations_events_worker_scope' AND tgenabled='A')")).scalar():
        problems.append('Worker operational-event scope protection absent')
    if c.execute(text("SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege(p.oid,'EXECUTE'))")).scalar():
        problems.append('Unreviewed executable SECURITY DEFINER function')
    if problems: raise RuntimeError('Database security verification failed: '+'; '.join(sorted(set(problems))))
    return {'purpose':purpose, 'verified':True, 'tables':len(tables)}


def prepare_roles(c):
    """Explicit one-shot bootstrap for a dedicated database, no passwords."""
    require_postgres(c)
    c.execute(text('SELECT pg_advisory_xact_lock(7341592619)'))
    roles = [OWNER, MIGRATOR, *PURPOSES.values()]
    for name in roles:
        row = c.execute(text("SELECT shobj_description(oid,'pg_authid') FROM pg_roles WHERE rolname=:n"),{'n':name}).first()
        q = quote(c,name)
        if row:
            if row[0] != MARKER: raise RuntimeError('Existing unmarked role requires explicit operator review')
            if c.execute(text("SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=:n"),{'n':name}).scalar():
                raise RuntimeError('Existing managed identity has unsafe attributes; no automatic downgrade')
            if name==OWNER and c.execute(text('SELECT rolcanlogin FROM pg_roles WHERE rolname=:n'),{'n':name}).scalar():
                raise RuntimeError('Schema owner must remain NOLOGIN')
        else:
            c.exec_driver_sql(f'CREATE ROLE {q} '+('NOLOGIN' if name==OWNER else 'LOGIN')+' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT')
            c.exec_driver_sql(f"COMMENT ON ROLE {q} IS '{MARKER}'")
        c.exec_driver_sql(f"ALTER ROLE {q} SET timezone='UTC'")
    c.exec_driver_sql(f'GRANT {quote(c,OWNER)} TO {quote(c,MIGRATOR)}')
    # PG16 CREATEROLE does not automatically grant SET on newly created roles.
    bootstrap=quote(c,c.execute(text('SELECT current_user')).scalar_one())
    c.exec_driver_sql(f'GRANT {quote(c,OWNER)} TO {bootstrap}')
    database=quote(c,c.execute(text('SELECT current_database()')).scalar_one())
    c.exec_driver_sql(f'GRANT CREATE ON DATABASE {database} TO {quote(c,OWNER)}')
    c.exec_driver_sql(f'GRANT USAGE,CREATE ON SCHEMA public TO {quote(c,OWNER)}')
    c.exec_driver_sql(f'GRANT CONNECT ON DATABASE {database} TO {quote(c,MIGRATOR)}')
    c.exec_driver_sql(f'GRANT USAGE ON SCHEMA public TO {quote(c,MIGRATOR)}')


def provision(c, *, adopt=False):
    """Dedicated database only; transactional, serialized, no credential rotation.

    Bootstrap caller needs CREATEROLE/admin options and ownership of the objects
    being adopted. No superuser-only commands or broad REASSIGN OWNED are used.
    """
    require_postgres(c)
    from app.database import Base
    import app.models  # noqa: F401
    tables = set(inspect(c).get_table_names(schema='public'))
    expected = set(Base.metadata.tables) | {'alembic_version'}
    if tables != expected: raise RuntimeError('Provisioning requires the exact migrated application table inventory')
    prepare_roles(c)
    database = quote(c,c.execute(text('SELECT current_database()')).scalar_one())
    c.exec_driver_sql(f'REVOKE CREATE,TEMPORARY ON DATABASE {database} FROM PUBLIC')
    c.exec_driver_sql('REVOKE ALL ON SCHEMA public FROM PUBLIC')
    owner = quote(c,OWNER)
    if adopt:
        c.exec_driver_sql(f'GRANT CREATE ON DATABASE {database} TO {owner}')
        c.exec_driver_sql(f'ALTER SCHEMA public OWNER TO {owner}')
        for table in sorted(tables): c.exec_driver_sql(f'ALTER TABLE public.{quote(c,table)} OWNER TO {owner}')
        # Trigger functions are part of the application's protected schema.
        functions=c.execute(text("SELECT p.oid::regprocedure::text AS signature, p.prorettype='trigger'::regtype AS trigger FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'")).mappings().all()
        if any(not f['trigger'] for f in functions): raise RuntimeError('Unexpected public function requires explicit review')
        for signature in (f['signature'] for f in functions):
            # regprocedure is server-rendered, not caller input.
            c.exec_driver_sql(f'ALTER FUNCTION {signature} OWNER TO {owner}')
    owners = c.execute(text("SELECT DISTINCT pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','S','p')")).scalars().all()
    if set(owners) != {OWNER}: raise RuntimeError('Objects require reviewed ownership adoption')
    # Fail closed for new migration objects until provisioning is repeated.
    c.exec_driver_sql(f'ALTER DEFAULT PRIVILEGES FOR ROLE {owner} IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC')
    c.exec_driver_sql('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC')
    c.exec_driver_sql('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC')
    c.exec_driver_sql('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC')
    sequences = c.execute(text("SELECT sequencename FROM pg_sequences WHERE schemaname='public'")).scalars().all()
    for purpose, name in PURPOSES.items():
        q = quote(c,name)
        c.exec_driver_sql(f'GRANT CONNECT ON DATABASE {database} TO {q}')
        c.exec_driver_sql(f'GRANT USAGE ON SCHEMA public TO {q}')
        c.exec_driver_sql(f'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {q}')
        c.exec_driver_sql(f'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {q}')
        c.exec_driver_sql(f'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM {q}')
        reads,writes = privilege_plan(tables,purpose)
        for table in sorted(tables):
            columns_all=','.join(quote(c,col['name']) for col in inspect(c).get_columns(table,schema='public'))
            c.exec_driver_sql(f'REVOKE ALL ({columns_all}) ON TABLE public.{quote(c,table)} FROM {q}')
            actions = ({'SELECT'} if table in reads else set()) | (writes.get(table,set())-{'LOCK','JOB_UPDATE','WORKER_UPDATE'})
            if actions: c.exec_driver_sql(f'GRANT {",".join(sorted(actions))} ON TABLE public.{quote(c,table)} TO {q}')
            columns=COLUMN_READS.get(purpose,{}).get(table)
            if columns: c.exec_driver_sql(f'GRANT SELECT ({",".join(quote(c,col) for col in sorted(columns))}) ON public.{quote(c,table)} TO {q}')
            update_columns=UPDATE_COLUMNS.get(purpose,{}).get(table)
            if update_columns: c.exec_driver_sql(f'GRANT UPDATE ({",".join(quote(c,col) for col in sorted(update_columns))}) ON public.{quote(c,table)} TO {q}')
            if 'INSERT' in actions:
                for column in inspect(c).get_columns(table,schema='public'):
                    sequence=c.execute(text('SELECT pg_get_serial_sequence(:t,:col)'),{'t':'public.'+table,'col':column['name']}).scalar()
                    if sequence: c.exec_driver_sql(f'GRANT USAGE ON SEQUENCE {sequence} TO {q}')
        if purpose=='backup':
            for sequence in sequences: c.exec_driver_sql(f'GRANT SELECT ON SEQUENCE public.{quote(c,sequence)} TO {q}')
    c.exec_driver_sql(f'GRANT CONNECT ON DATABASE {database} TO {quote(c,MIGRATOR)}')
    c.exec_driver_sql(f'GRANT USAGE ON SCHEMA public TO {quote(c,MIGRATOR)}')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('action',choices=['inspect','prepare','provision','verify'])
    p.add_argument('--dsn-file',required=True)
    p.add_argument('--purpose',choices=list(PURPOSES))
    p.add_argument('--apply',action='store_true')
    p.add_argument('--adopt-owned-objects',action='store_true')
    args=p.parse_args()
    database=create_engine(Path(args.dsn_file).read_text().strip(),hide_parameters=True)
    try:
        with database.begin() as c:
            if args.action in {'prepare','provision'}:
                if not args.apply: raise RuntimeError('Provisioning is an explicit maintenance operation; --apply required')
                if args.action=='prepare': prepare_roles(c)
                else: provision(c,adopt=args.adopt_owned_objects)
                result={'provisioned':True,'credentials_changed':False}
            elif args.action=='verify': result=verify(c,args.purpose)
            else: result=inspect_access(c)
        print(json.dumps(result))
    finally: database.dispose()


if __name__=='__main__':
    try: main()
    except Exception: raise SystemExit('Database security operation failed safely. Review privileges privately; credentials and SQL parameters are not printed.') from None

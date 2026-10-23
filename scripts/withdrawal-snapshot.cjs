const codes=['withdrawals:own','withdrawals:read','withdrawals:approve','withdrawals:process','withdrawals:verify'];
module.exports=`
from sqlalchemy import text
from app.database import engine
import json,hashlib
codes=${JSON.stringify(codes)}
result={'tables':{},'sequences':{}}
with engine.connect() as c:
 c.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'))
 c.execute(text("SET TIME ZONE 'UTC'"))
 result['database']=c.execute(text('select current_database()')).scalar()
 result['revision']=c.execute(text('select version_num from alembic_version')).scalar()
 result['permissions']=list(c.execute(text('select code from permissions order by code')).scalars())
 for name in c.execute(text("select tablename from pg_tables where schemaname='public' order by tablename")).scalars():
  if name=='alembic_version':continue
  quoted=c.dialect.identifier_preparer.quote(name)
  rows=sorted(c.execute(text('select row_to_json(t)::text from '+quoted+' t')).scalars())
  columns=[list(r) for r in c.execute(text("select a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid) from pg_attribute a join pg_class t on t.oid=a.attrelid join pg_namespace n on n.oid=t.relnamespace left join pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum where n.nspname='public' and t.relname=:name and a.attnum>0 and not a.attisdropped order by a.attnum"),{'name':name})]
  constraints=sorted(c.execute(text("select pg_get_constraintdef(con.oid) from pg_constraint con join pg_class t on t.oid=con.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relname=:name"),{'name':name}).scalars())
  indexes=sorted(c.execute(text("select indexdef from pg_indexes where schemaname='public' and tablename=:name"),{'name':name}).scalars())
  triggers=sorted(c.execute(text("select pg_get_triggerdef(g.oid) from pg_trigger g join pg_class t on t.oid=g.tgrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relname=:name and not g.tgisinternal"),{'name':name}).scalars())
  result['tables'][name]={'rows':len(rows),'sha256':hashlib.sha256('\\n'.join(rows).encode()).hexdigest(),'structure_sha256':hashlib.sha256(json.dumps([columns,constraints,indexes,triggers],sort_keys=True).encode()).hexdigest()}
 for name,value in c.execute(text("select sequencename,last_value from pg_sequences where schemaname='public' order by sequencename")):
  result['sequences'][name]=value
print(json.dumps(result,sort_keys=True))
`;

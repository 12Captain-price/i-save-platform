"""Protect global audit history; no changes to historical events or grants."""
from alembic import op
import sqlalchemy as sa

revision = '0019_database_audit'
down_revision = '0018_operations'
branch_labels = depends_on = None


def upgrade():
    bind = op.get_bind()
    fk = next(f for f in sa.inspect(bind).get_foreign_keys('audit_events') if f['constrained_columns']==['actor_user_id'])
    if bind.dialect.name == 'postgresql':
        op.drop_constraint(fk['name'], 'audit_events', type_='foreignkey')
        op.create_foreign_key('audit_events_actor_user_id_fkey', 'audit_events', 'users', ['actor_user_id'], ['id'], ondelete='RESTRICT')
        op.execute("""CREATE FUNCTION public.audit_history_immutable() RETURNS trigger
            LANGUAGE plpgsql SET search_path = pg_catalog AS $$
            BEGIN RAISE EXCEPTION 'Audit history is append-only' USING ERRCODE='42501'; END $$""")
        op.execute('CREATE TRIGGER audit_events_no_mutation BEFORE UPDATE OR DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_history_immutable()')
        op.execute('CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON public.audit_events FOR EACH STATEMENT EXECUTE FUNCTION public.audit_history_immutable()')
        for name in ('audit_events_no_mutation','audit_events_no_truncate'):
            op.execute('ALTER TABLE public.audit_events ENABLE ALWAYS TRIGGER '+name)
        op.execute('REVOKE ALL ON FUNCTION public.audit_history_immutable() FROM PUBLIC')
        # A backup worker can append its results, not publish retention policy.
        # Workers cannot forge an authenticated staff actor in global history.
        op.execute("""CREATE FUNCTION public.worker_event_scope() RETURNS trigger
            LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
            IF TG_TABLE_NAME='audit_events' AND session_user IN ('isave_account_worker','isave_subscription_worker') THEN
                IF NEW.actor_user_id IS NOT NULL OR NEW.actor_email IS NOT NULL OR NOT (
                    (session_user='isave_account_worker' AND ((NEW.event_type='security' AND NEW.action='public_recovery_link_issued') OR (NEW.event_type='campaign' AND NEW.action='campaign_dispatch_result')))
                    OR (session_user='isave_subscription_worker' AND ((NEW.event_type='subscription_generation' AND NEW.action='monthly_subscription_created') OR (NEW.event_type='fee_currency' AND NEW.action='fee_obligation_created'))))
                THEN RAISE EXCEPTION 'Worker audit scope denied' USING ERRCODE='42501'; END IF;
            ELSIF TG_TABLE_NAME='operations_events' AND session_user='isave_operations_worker' THEN
                IF NEW.actor_id IS NOT NULL OR NEW.actor_email IS NOT NULL OR NEW.action NOT IN ('backup_queued','backup_interrupted','backup_result','restore_verified')
                THEN RAISE EXCEPTION 'Worker operational scope denied' USING ERRCODE='42501'; END IF;
            END IF; RETURN NEW; END $$""")
        for table in ('audit_events','operations_events'):
            name=table+'_worker_scope'
            op.execute(f'CREATE TRIGGER {name} BEFORE INSERT ON public.{table} FOR EACH ROW EXECUTE FUNCTION public.worker_event_scope()')
            op.execute(f'ALTER TABLE public.{table} ENABLE ALWAYS TRIGGER {name}')
        op.execute('REVOKE ALL ON FUNCTION public.worker_event_scope() FROM PUBLIC')
    else:
        with op.batch_alter_table('audit_events', naming_convention={'fk':'fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s'}) as batch:
            batch.drop_constraint(fk['name'] or 'fk_audit_events_actor_user_id_users', type_='foreignkey')
            batch.create_foreign_key('audit_events_actor_user_id_fkey','users',['actor_user_id'],['id'],ondelete='RESTRICT')
        for action in ('UPDATE','DELETE'):
            op.execute(f"CREATE TRIGGER audit_events_no_{action.lower()} BEFORE {action} ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit history is append-only'); END")


def downgrade():
    # Removing these protections is a privileged recovery decision, not an app rollback.
    if op.get_bind().execute(sa.text('SELECT count(*) FROM audit_events')).scalar():
        raise RuntimeError('Audit history is retained; history must be retained during reviewed recovery')
    bind=op.get_bind()
    # SQLite DDL is not transactional. Preflight older retained workflows before
    # removing this revision's protections; a later refusal must not strand it
    # at an intermediate revision. These are deliberately frozen revision names.
    retained=['user_permissions','application_submissions','savings_interests',
        'membership_approvals','application_registration_payments','password_setup_invitations',
        'plan_draft_versions','application_settings_snapshots','subscription_settings_snapshots',
        'fee_obligations','subscription_fee_payments','fee_rate_publications',
        'registration_evidence_profiles','application_evidence','evidence_reviews',
        'plan_approvals','plan_publications','plan_applications','plan_enrolments','plan_application_events',
        'savings_contributions','savings_events','savings_ledger_entries',
        'withdrawal_requests','withdrawal_events','withdrawal_payouts','withdrawal_debits',
        'account_links','notifications','recovery_requests','content_versions','content_events','public_media',
        'support_tickets','ticket_events','ticket_messages','marketing_preferences','marketing_consent_events',
        'campaigns','campaign_versions','campaign_events','campaign_recipients','campaign_delivery_events',
        'campaign_unsubscribe_links','operations_policies','operations_events','backup_jobs']
    for table in retained:
        if bind.execute(sa.text('SELECT count(*) FROM '+table)).scalar():
            label='Submission provenance' if table=='application_submissions' else table+' history'
            raise RuntimeError(label+' is retained; history must be retained')
    basic={'staff':{'members:read','applications:read','plans:read'},'finance':{'members:read','contributions:read','fees:read','subscriptions:read','verifications:read','plans:read'}}
    for role,code in bind.execute(sa.text('SELECT r.name,p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id')):
        if not ((role=='administrator' and not code.endswith(':own')) or (role=='member' and code.endswith(':own')) or code in basic.get(role,set())):
            raise RuntimeError('Delegated permission history is retained')
    if bind.dialect.name=='postgresql':
        for table in ('audit_events','operations_events'):
            op.execute(f'DROP TRIGGER {table}_worker_scope ON public.{table}')
        op.execute('DROP FUNCTION public.worker_event_scope()')
        op.execute('DROP TRIGGER audit_events_no_mutation ON audit_events')
        op.execute('DROP TRIGGER audit_events_no_truncate ON audit_events')
        op.execute('DROP FUNCTION public.audit_history_immutable()')
        op.drop_constraint('audit_events_actor_user_id_fkey','audit_events',type_='foreignkey')
        op.create_foreign_key('audit_events_actor_user_id_fkey','audit_events','users',['actor_user_id'],['id'],ondelete='SET NULL')
    else:
        for action in ('update','delete'): op.execute('DROP TRIGGER audit_events_no_'+action)
        with op.batch_alter_table('audit_events') as batch:
            batch.drop_constraint('audit_events_actor_user_id_fkey',type_='foreignkey')
            batch.create_foreign_key('audit_events_actor_user_id_fkey','users',['actor_user_id'],['id'],ondelete='SET NULL')

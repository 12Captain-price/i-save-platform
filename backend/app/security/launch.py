"""Default-deny mutation inventory for restricted launch modes.

These gates are additional to all endpoint permissions and policy checks.
"""
from starlette.responses import JSONResponse
from starlette.requests import Request
from fastapi.security import HTTPAuthorizationCredentials
from app.config import get_settings

PUBLIC_READ = {'/health','/ready','/api/v1/public/contacts','/api/v1/public/registration-requirements','/api/v1/public/plan-offers','/api/v1/public/availability'}
AUTH_ACTIONS = {'/api/v1/auth/'+x for x in ('login','logout','setup-password','recovery','reset-password','password')}
# Administrative configuration and content publication are operational access,
# never an exception for financial processing or applicant intake.
OPERATIONS = ('/api/v1/admin/organisation-settings','/api/v1/admin/fee-rates','/api/v1/admin/plan-drafts','/api/v1/admin/operations','/api/v1/admin/staff','/api/v1/admin/account-links','/api/v1/content')


def is_public_read(path):
    return path in PUBLIC_READ or path == '/api/v1/public/content' or path.startswith('/api/v1/public/content/')


def admin_request(scope):
    from app.database import get_db
    from app.security.auth import current_session
    from app.models.user import User
    request = Request(scope)
    authorization = request.headers.get('authorization','')
    if not authorization.startswith('Bearer '): return False
    factory = scope['app'].dependency_overrides.get(get_db, get_db)
    generator = factory()
    try:
        db = next(generator)
        session = current_session(request,HTTPAuthorizationCredentials(scheme='Bearer',credentials=authorization[7:]),db)
        actor = db.get(User,session.user_id)
        return bool(actor and actor.role and actor.role.name == 'administrator')
    except Exception: return False
    finally: generator.close()


class LaunchBoundary:
    def __init__(self, app): self.app=app

    async def __call__(self, scope, receive, send):
        mode = get_settings().effective_launch_mode
        if scope['type'] != 'http' or mode == 'full': return await self.app(scope,receive,send)
        path,method = scope['path'],scope['method']
        reading = method in {'GET','HEAD','OPTIONS'}
        auth = path.startswith('/api/v1/auth/')
        # Unsubscribe remains possible even during a restricted launch.
        allowed = path == '/api/v1/public/campaign-unsubscribe' and method == 'POST'
        allowed |= (reading and is_public_read(path)) or (auth and (reading or path in AUTH_ACTIONS))
        if not allowed and any(path == p or path.startswith(p+'/') for p in OPERATIONS):
            allowed = admin_request(scope)
        if mode == 'applications':
            allowed |= reading or path == '/api/v1/registration' or path == '/api/v1/registration/assisted' or path.startswith('/api/v1/application-documents/')
            allowed |= path.startswith('/api/v1/support') or path.startswith('/api/v1/notifications/') or path == '/api/v1/marketing/preferences'
        elif reading and not allowed:
            allowed = admin_request(scope)
        if not allowed:
            return await JSONResponse({'error':{'code':'launch_mode_unavailable','message':'This action is unavailable in the current launch mode.'}},503,headers={'Cache-Control':'no-store'})(scope,receive,send)
        return await self.app(scope,receive,send)

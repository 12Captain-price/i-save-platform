"""Private authenticated gateway assertions; never trust X-Forwarded-*.

The TLS gateway overwrites client assertions; Node checks the gateway secret
and relays only validated assertions. Uvicorn proxy parsing stays disabled.
"""
import hmac
import ipaddress
from urllib.parse import urlsplit
from starlette.responses import JSONResponse
from app.config import get_settings


class GatewayBoundary:
    def __init__(self, app): self.app = app

    async def __call__(self, scope, receive, send):
        settings = get_settings()
        if scope['type'] != 'http' or settings.app_env != 'production' or scope['path'] in {'/health','/ready'}:
            return await self.app(scope, receive, send)
        headers = scope.get('headers', [])
        def one(name):
            values = [v.decode('latin1') for k,v in headers if k.lower() == name]
            return values[0] if len(values) == 1 else ''
        try:
            valid = hmac.compare_digest(one(b'x-isave-gateway'), settings.gateway_token)
            ip = str(ipaddress.ip_address(one(b'x-isave-client-ip')))
            valid = valid and one(b'x-isave-proto') == 'https'
        except (ValueError,TypeError): valid = False
        if not valid:
            return await JSONResponse({'error':{'code':'gateway_required','message':'Trusted HTTPS gateway required'}},403)(scope,receive,send)
        scope = dict(scope, scheme='https', client=(ip,0))
        # Secrets/assertions are not exposed to handlers, error reporters or logs.
        scope['headers'] = [(k,v) for k,v in headers if not k.startswith((b'x-isave-gateway',b'x-isave-client-ip',b'x-isave-proto',b'x-forwarded',b'forwarded'))]
        public_host=urlsplit(settings.public_origin).netloc
        if public_host:
            scope['headers']=[(k,v) for k,v in scope['headers'] if k!=b'host']+[(b'host',public_host.encode('ascii'))]
        if scope.get('method') not in {'GET','HEAD','OPTIONS'}:
            # Bound streamed input before FastAPI parses JSON. Gateway has its
            # own cap too; this also protects direct authenticated private hops.
            limit = 4096 if scope['path'].startswith('/api/v1/auth/') else 9*1024*1024
            chunks=[];size=0
            while True:
                message=await receive()
                if message['type']=='http.disconnect': return
                size+=len(message.get('body',b''))
                if size>limit:
                    return await JSONResponse({'error':{'code':'body_too_large','message':'Request exceeds the size limit'}},413)(scope,receive,send)
                chunks.append(message)
                if not message.get('more_body'):break
            original_receive=receive
            async def replay():
                return chunks.pop(0) if chunks else await original_receive()
            receive=replay
        return await self.app(scope,receive,send)

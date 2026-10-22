"""Bound JSON evidence requests before parsing, including chunked bodies."""
from starlette.responses import JSONResponse


class EvidenceBodyLimit:
    def __init__(self, app):self.app=app

    async def __call__(self, scope, receive, send):
        path=scope.get('path','')
        if scope['type']!='http' or scope.get('method') not in {'POST','PUT'} or not (path.startswith('/api/v1/registration') or path.startswith('/api/v1/application-documents')):
            return await self.app(scope,receive,send)
        chunks=[];size=0
        while True:
            message=await receive()
            if message['type']=='http.disconnect':return
            size+=len(message.get('body',b''))
            if size>9*1024*1024:
                return await JSONResponse({'error':{'code':'body_too_large','message':'Upload request exceeds the size limit'}},status_code=413,headers={'Cache-Control':'no-store'})(scope,receive,send)
            chunks.append(message)
            if not message.get('more_body'):break
        async def replay():
            if chunks:return chunks.pop(0)
            return await receive()
        return await self.app(scope,replay,send)

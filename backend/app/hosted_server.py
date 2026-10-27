"""No migration on API startup; schema is checked by application lifespan."""
from app.config import get_settings

def main():
    get_settings().validate_runtime()
    import uvicorn
    uvicorn.run('app.main:app',host='0.0.0.0',port=8000,proxy_headers=False,access_log=False)

if __name__=='__main__': main()

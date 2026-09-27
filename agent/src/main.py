import argparse
import sys
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import DEFAULT_PORT, get_or_create_auth_token, TOKEN_FILE
from .api.routes import router

app = FastAPI(
    title="ShadowBrowse Local Privacy Agent",
    description="Local privacy daemon for ShadowBrowse. Handles Tor/proxy routing, health checks, and leak diagnostics.",
    version="0.2.0",
    docs_url=None,     # Disable Swagger UI — no public API surface exposure
    redoc_url=None,    # Disable ReDoc UI
    openapi_url=None,  # Disable /openapi.json schema endpoint entirely
)

# CORS restricted strictly to Chrome extensions and local tools
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://[a-z]{32}|http://127\.0\.0\.1(:\d+)?|http://localhost(:\d+)?)$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(router)


def run():
    parser = argparse.ArgumentParser(description="ShadowBrowse Local Privacy Agent")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to bind (default: 9152)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    args = parser.parse_args()

    token = get_or_create_auth_token()
    print("=" * 60)
    print(" SHADOWBROWSE LOCAL PRIVACY AGENT (shadow-agent)")
    print("=" * 60)
    print(f" Binding strictly to: http://{args.host}:{args.port}")
    print(f" Auth Token Location: {TOKEN_FILE}")
    print(f" Auth Token (secret): {token}")
    print("-" * 60)
    print(" Ensure this token is set in your ShadowBrowse Extension settings.")
    print("=" * 60)

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
        access_log=False  # Crucial: Avoid logging request paths or browsing metadata!
    )

if __name__ == "__main__":
    run()

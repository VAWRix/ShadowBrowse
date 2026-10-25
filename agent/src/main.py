import argparse
import sys
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from .config import DEFAULT_PORT, get_or_create_auth_token, TOKEN_FILE
from .api.routes import router

MAX_REQUEST_BODY_SIZE = 1024 * 1024  # 1 MB maximum payload

app = FastAPI(
    title="ShadowBrowse Local Privacy Agent",
    description="Local privacy daemon for ShadowBrowse. Handles Tor/proxy routing, health checks, and leak diagnostics.",
    version="0.3.0",
    docs_url=None,     # Disable Swagger UI — no public API surface exposure
    redoc_url=None,    # Disable ReDoc UI
    openapi_url=None,  # Disable /openapi.json schema endpoint entirely
)

# Phase 7B: Security Response Headers and Request Body Size Bounding
@app.middleware("http")
async def security_headers_and_limits(request: Request, call_next):
    # Enforce request body size limit if Content-Length header is present
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BODY_SIZE:
                return Response(
                    content='{"detail":"Payload Too Large: Request body exceeds 1MB limit."}',
                    status_code=413,
                    media_type="application/json",
                )
        except ValueError:
            return Response(
                content='{"detail":"Bad Request: Invalid Content-Length header."}',
                status_code=400,
                media_type="application/json",
            )

    response = await call_next(request)

    # Security headers to prevent MIME sniffing, clickjacking, and caching of sensitive routing info
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none';"
    return response

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

    # Enforce loopback-only binding to prevent accidental LAN exposure
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print(f"ERROR: Refusing to bind to non-loopback host '{args.host}'.", file=sys.stderr)
        print("ShadowBrowse Agent must strictly bind to loopback (127.0.0.1, ::1, or localhost) for privacy and security.", file=sys.stderr)
        sys.exit(1)

    token = get_or_create_auth_token()
    print("=" * 60)
    print(" SHADOWBROWSE LOCAL PRIVACY AGENT (shadow-agent)")
    print("=" * 60)
    print(f" Binding strictly to: http://{args.host}:{args.port}")
    print(f" Auth Token Location: {TOKEN_FILE}")
    print(f" Auth Token: {token[:8]}... (redacted for log safety; read full secret from file)")
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

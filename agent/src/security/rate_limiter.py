import os
import time
from collections import defaultdict
from fastapi import Request, HTTPException

class InMemoryRateLimiter:
    """
    Local rate limiter to prevent local malware or spam scripts
    from flooding the Shadow Agent API.
    Limits to 60 requests per minute per IP in production;
    relaxed under SHADOWBROWSE_TEST_MODE for automated test suite execution.
    """
    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        self.default_max_requests = max_requests
        self.window_seconds = window_seconds
        self.history = defaultdict(list)

    @property
    def max_requests(self) -> int:
        if os.environ.get("SHADOWBROWSE_TEST_MODE", "").lower() in ("1", "true", "yes"):
            return 10000
        return self.default_max_requests

    def check(self, request: Request):
        client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.time()
        
        # Prune old records
        self.history[client_ip] = [
            t for t in self.history[client_ip] if now - t < self.window_seconds
        ]

        if len(self.history[client_ip]) >= self.max_requests:
            raise HTTPException(
                status_code=429,
                detail="Too Many Requests: Rate limit exceeded on localhost privacy agent."
            )

        self.history[client_ip].append(now)

rate_limiter = InMemoryRateLimiter()

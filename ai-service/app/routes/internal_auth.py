import hmac
import os

from fastapi import Header, HTTPException


async def require_internal_service_token(
    x_ai_service_token: str | None = Header(default=None),
) -> None:
    expected = os.getenv("AI_SERVICE_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="AI service authorization is not configured.",
        )
    if not x_ai_service_token or not hmac.compare_digest(
        x_ai_service_token, expected
    ):
        raise HTTPException(status_code=403, detail="Forbidden.")

from fastapi import APIRouter, Depends, HTTPException

from app.routes.internal_auth import require_internal_service_token
from app.schemas.ai_schemas import TextMatchRequest
from app.services.text_matching import compare_item_descriptions

router = APIRouter()


@router.post("/match-text", dependencies=[Depends(require_internal_service_token)])
async def match_text(request: TextMatchRequest):
    try:
        result = await compare_item_descriptions(
            request.lost_description,
            request.found_description,
            request.lost_title,
            request.found_title,
        )
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="AI matching is unavailable.") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="AI matching is unavailable.") from exc
    return {"success": True, **result}

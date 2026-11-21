from fastapi import APIRouter, Depends, HTTPException

from app.routes.internal_auth import require_internal_service_token
from app.schemas.ai_schemas import QuestionGenerationRequest
from app.services.gemini_service import generate_ownership_questions

router = APIRouter()


@router.post(
    "/ownership-questions",
    dependencies=[Depends(require_internal_service_token)],
)
async def ownership_questions(request: QuestionGenerationRequest):
    try:
        questions = await generate_ownership_questions(
            request.item_name,
            request.description,
            request.value_tier,
        )
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="Question suggestions are unavailable.") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Question suggestions are unavailable.") from exc
    return {"success": True, "questions": questions}

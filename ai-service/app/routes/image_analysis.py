from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.routes.internal_auth import require_internal_service_token
from app.services.image_analysis import analyze_item_image
from app.config import MAX_IMAGE_SIZE_BYTES
from app.services.image_validation import validate_image_bytes

router = APIRouter()


@router.post("/validate-image", dependencies=[Depends(require_internal_service_token)])
async def validate_image(file: UploadFile = File(...)):
    try:
        image_bytes = await file.read(MAX_IMAGE_SIZE_BYTES + 1)
        if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
            raise ValueError("Image exceeds the allowed file size.")
        return {"success": True, "image": validate_image_bytes(image_bytes, file.content_type or "")}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Image validation is unavailable.") from exc


@router.post(
    "/analyze-image",
    dependencies=[Depends(require_internal_service_token)],
)
async def analyze_image(file: UploadFile = File(...)):
    try:
        result = await analyze_item_image(file)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Image analysis is unavailable.") from exc
    return {"success": True, "analysis": result}

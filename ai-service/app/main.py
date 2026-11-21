
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.routes.health import router as health_router
from app.routes.image_analysis import router as image_analysis_router
from app.routes.matching import router as matching_router
from app.routes.questions import router as questions_router
from app.config import MAX_IMAGE_SIZE_BYTES

app = FastAPI(
    title="FindBack AI Service",
    description="AI-powered Lost and Found analysis and matching service",
    version="1.0.0"
)

app.include_router(health_router)
app.include_router(matching_router)
app.include_router(questions_router, prefix="/api/ai")
app.include_router(image_analysis_router)


@app.middleware("http")
async def bound_image_request_size(request: Request, call_next):
    if request.url.path in {"/validate-image", "/analyze-image"}:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                too_large = int(content_length) > MAX_IMAGE_SIZE_BYTES + 256 * 1024
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length."})
            if too_large:
                return JSONResponse(status_code=413, content={"detail": "Image exceeds the allowed file size."})
    return await call_next(request)


@app.get("/")
async def root():
    return {
        "success": True,
        "service": "FindBack AI",
        "message": "AI service is running"
    }

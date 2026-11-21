
import json
from google.genai import types

from app.config import (
    GEMINI_MODEL,
    MAX_IMAGE_SIZE_BYTES
)

from app.services.gemini_service import get_gemini_client
from app.services.image_validation import validate_image_bytes


async def analyze_item_image(file):

    content_type = file.content_type

    # Bound memory use even when the multipart Content-Length is absent or false.
    image_bytes = await file.read(MAX_IMAGE_SIZE_BYTES + 1)
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise ValueError("Image exceeds the allowed file size.")
    validate_image_bytes(image_bytes, content_type)

    prompt = """
    Analyze this item photograph for a lost and found platform.

    Identify:

    - General item category
    - Visible color
    - Material, if recognizable
    - Brand, only if clearly visible
    - Distinguishing characteristics
    - Visible accessories
    - Short visual description

    Rules:

    1. Do not invent details.
    2. Do not identify people.
    3. Do not infer ownership.
    4. Use unknown when a detail cannot be determined.

    Return valid JSON:

    {
        "item_category": "string",
        "color": "string",
        "material": "string",
        "brand": "string",
        "distinguishing_features": [],
        "visible_accessories": [],
        "description": "string"
    }
    """

    image_part = types.Part.from_bytes(
        data=image_bytes,
        mime_type=content_type
    )

    client = get_gemini_client()

    response = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=[prompt, image_part],
        config={
            "response_mime_type": "application/json",
        }
    )

    if not response.text:
        raise ValueError("Gemini returned an empty response.")

    try:
        result = json.loads(response.text)

    except json.JSONDecodeError:
        raise ValueError("Invalid image analysis response.")

    required_fields = [
        "item_category",
        "color",
        "material",
        "brand",
        "distinguishing_features",
        "visible_accessories",
        "description"
    ]

    if not isinstance(result, dict):
        raise ValueError("Invalid image analysis format.")

    for field in required_fields:
        if field not in result:
            raise ValueError(f"Missing image analysis field: {field}")

    for field in ["item_category", "color", "material", "brand", "description"]:
        if not isinstance(result[field], str):
            raise ValueError(f"Invalid image analysis field: {field}")

    for field in ["distinguishing_features", "visible_accessories"]:
        if not isinstance(result[field], list) or not all(
            isinstance(value, str) for value in result[field]
        ):
            raise ValueError(f"Invalid image analysis field: {field}")

    return result

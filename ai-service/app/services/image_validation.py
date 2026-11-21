from io import BytesIO
import warnings

from PIL import Image, UnidentifiedImageError

from app.config import MAX_IMAGE_PIXELS


ALLOWED_FORMATS = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


def validate_image_bytes(image_bytes: bytes, declared_content_type: str) -> dict:
    if not image_bytes:
        raise ValueError("Uploaded image is empty.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(image_bytes)) as image:
                actual_format = image.format
                width, height = image.size
                if actual_format not in ALLOWED_FORMATS:
                    raise ValueError("Only JPEG, PNG and WEBP images are allowed.")
                if ALLOWED_FORMATS[actual_format] != declared_content_type:
                    raise ValueError("Image content does not match its declared type.")
                if width < 1 or height < 1 or width * height > MAX_IMAGE_PIXELS:
                    raise ValueError("Image dimensions exceed the allowed limit.")
                image.verify()

            # Re-open and decode the pixels; header-only and truncated files fail here.
            with Image.open(BytesIO(image_bytes)) as decoded:
                decoded.load()
                if decoded.size != (width, height) or decoded.format != actual_format:
                    raise ValueError("Image could not be decoded safely.")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("Image file is malformed or cannot be decoded.") from exc

    return {"format": actual_format, "width": width, "height": height, "pixelCount": width * height}

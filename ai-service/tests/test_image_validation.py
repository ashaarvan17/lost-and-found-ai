import io
import unittest
from unittest.mock import patch

from PIL import Image

from app.services.image_validation import validate_image_bytes


def image_bytes(fmt: str, size=(8, 6)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color=(12, 34, 56)).save(buffer, format=fmt)
    return buffer.getvalue()


class ImageValidationTests(unittest.TestCase):
    def test_decodes_allowed_formats_and_returns_dimensions(self):
        cases = [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")]
        for fmt, mime in cases:
            with self.subTest(fmt=fmt):
                result = validate_image_bytes(image_bytes(fmt), mime)
                self.assertEqual(result["format"], fmt)
                self.assertEqual((result["width"], result["height"]), (8, 6))

    def test_rejects_mismatched_mime_and_malformed_or_truncated_data(self):
        valid_png = image_bytes("PNG")
        with self.assertRaisesRegex(ValueError, "declared type"):
            validate_image_bytes(valid_png, "image/jpeg")
        with self.assertRaises(ValueError):
            validate_image_bytes(b"\x89PNG\r\n\x1a\nnot-an-image", "image/png")
        with self.assertRaises(ValueError):
            validate_image_bytes(valid_png[:30], "image/png")

    def test_rejects_images_over_pixel_limit_before_full_decode(self):
        with patch("app.services.image_validation.MAX_IMAGE_PIXELS", 20):
            with self.assertRaisesRegex(ValueError, "dimensions"):
                validate_image_bytes(image_bytes("PNG", (8, 6)), "image/png")


if __name__ == "__main__":
    unittest.main()

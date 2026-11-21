import unittest
from unittest.mock import AsyncMock, patch

from app.services.text_matching import compare_item_descriptions


class TextMatchingTests(unittest.IsolatedAsyncioTestCase):
    async def test_validated_score_uses_backend_compatibility_field(self):
        model_result = {
            "potential_match": True,
            "similarity_score": 76,
            "matching_factors": ["Same item category"],
            "conflicting_factors": [],
            "explanation": "Descriptions share details.",
        }

        with patch(
            "app.services.text_matching.generate_json",
            new=AsyncMock(return_value=model_result),
        ):
            result = await compare_item_descriptions(
                "black phone",
                "black phone",
                "Phone",
                "Mobile phone",
            )

        self.assertEqual(result["textSimilarity"], 76.0)
        self.assertEqual(result["similarity_score"], 76.0)

    async def test_invalid_model_output_is_rejected(self):
        model_result = {
            "potential_match": True,
            "similarity_score": 101,
            "matching_factors": [],
            "conflicting_factors": [],
            "explanation": "Invalid score.",
        }

        with patch(
            "app.services.text_matching.generate_json",
            new=AsyncMock(return_value=model_result),
        ):
            with self.assertRaisesRegex(ValueError, "similarity score"):
                await compare_item_descriptions("phone", "phone")


if __name__ == "__main__":
    unittest.main()

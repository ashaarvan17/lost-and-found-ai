
from app.services.gemini_service import generate_json


async def compare_item_descriptions(
    lost_description: str,
    found_description: str,
    lost_title: str = "",
    found_title: str = ""
):
    prompt = f"""
    You are an AI assistant for a privacy-first lost and found platform.

    Compare these two item descriptions.

    LOST ITEM:
    Title: {lost_title}
    {lost_description}

    FOUND ITEM:
    Title: {found_title}
    {found_description}

    Analyze:
    - Item type similarity
    - Brand or model similarity
    - Color similarity
    - Material similarity
    - Distinctive feature similarity

    Return JSON in this format:

    {{
        "potential_match": true,
        "similarity_score": 75,
        "matching_factors": [
            "Both descriptions mention a black backpack"
        ],
        "conflicting_factors": [
            "Different brand mentioned"
        ],
        "explanation": "Short explanation"
    }}

    Rules:
    - Score must be between 0 and 100.
    - Do not invent missing details.
    - Missing information is not a contradiction.
    - A high score is not proof of ownership.
    """

    result = await generate_json(prompt)

    score = result.get("similarity_score")

    if (
        not isinstance(score, (int, float))
        or isinstance(score, bool)
        or not 0 <= score <= 100
    ):
        raise ValueError("Invalid similarity score.")

    if not isinstance(result.get("potential_match"), bool):
        raise ValueError("Invalid potential match value.")

    for field in ["matching_factors", "conflicting_factors"]:
        if not isinstance(result.get(field), list) or not all(
            isinstance(value, str) for value in result[field]
        ):
            raise ValueError(f"Invalid {field}.")

    if not isinstance(result.get("explanation"), str):
        raise ValueError("Invalid explanation.")

    result["similarity_score"] = float(score)
    # Compatibility field consumed by the Node backend. This is a candidate
    # signal only; the backend applies its existing candidate logic.
    result["textSimilarity"] = float(score)

    return result

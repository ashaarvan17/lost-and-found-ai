
import json
from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TIMEOUT_MS


_client = None


def get_gemini_client():
    global _client

    if not GEMINI_API_KEY:
        raise ValueError(
            "GEMINI_API_KEY is missing from backend/.env"
        )

    if not GEMINI_MODEL:
        raise ValueError(
            "GEMINI_MODEL is missing from backend/.env"
        )

    if _client is None:
        _client = genai.Client(
            api_key=GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS),
        )

    return _client


async def generate_json(prompt: str):
    client = get_gemini_client()

    response = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config={
            "response_mime_type": "application/json"
        }
    )

    if not response.text:
        raise ValueError("Gemini returned an empty response.")

    try:
        result = json.loads(response.text)

    except json.JSONDecodeError:
        raise ValueError("Gemini returned invalid JSON.")

    if not isinstance(result, dict):
        raise ValueError("Gemini returned an invalid JSON object.")

    return result


async def generate_ownership_questions(
    item_name: str,
    description: str,
    value_tier: str
):
    question_counts = {
        "low": 3,
        "intermediate": 5,
        "high": 5
    }

    if value_tier not in question_counts:
        raise ValueError("Invalid item value tier.")

    count = question_counts[value_tier]

    prompt = f"""
    You are assisting a privacy-first lost and found platform.

    Generate exactly {count} ownership verification questions.

    Item name: {item_name}
    Description: {description}
    Value tier: {value_tier}

    Requirements:

    1. Questions must help distinguish the actual owner.
    2. Do not reveal expected answers.
    3. Avoid obvious questions.
    4. Prefer unique marks, accessories, hidden details,
       contents and distinctive characteristics.
    5. Questions must be simple and understandable.
    6. Do not claim that questions prove ownership.
    7. Do not invent item characteristics.

    Return JSON in this format:

    {{
        "questions": [
            "Question 1",
            "Question 2"
        ]
    }}

    Generate exactly {count} questions.
    """

    result = await generate_json(prompt)

    questions = result.get("questions")

    if not isinstance(questions, list):
        raise ValueError("Invalid question response.")

    questions = [
        question.strip()
        for question in questions
        if isinstance(question, str) and question.strip()
    ]

    if len(questions) != count:
        raise ValueError(
            f"Expected {count} questions, "
            f"but received {len(questions)}."
        )

    return questions


from typing import Literal
from pydantic import BaseModel, Field


class TextMatchRequest(BaseModel):
    lost_title: str = Field(default="", max_length=150)
    lost_description: str = Field(
        min_length=3,
        max_length=2000
    )

    found_title: str = Field(default="", max_length=150)
    found_description: str = Field(
        min_length=3,
        max_length=2000
    )


class QuestionGenerationRequest(BaseModel):
    item_name: str = Field(
        min_length=2,
        max_length=150
    )

    description: str = Field(
        min_length=3,
        max_length=2000
    )

    # Value tier must be determined by the backend.
    value_tier: Literal[
        "low",
        "intermediate",
        "high"
    ]

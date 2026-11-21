"""Start the AI service with its dedicated local development configuration."""

import os

os.environ["NODE_ENV"] = "development"

import uvicorn

uvicorn.run("app.main:app", host="127.0.0.1", port=8000)

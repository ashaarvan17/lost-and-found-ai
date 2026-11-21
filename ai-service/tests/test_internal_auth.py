import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routes.internal_auth import require_internal_service_token


class InternalAuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_internal_token_is_required_and_compared(self):
        with patch.dict(os.environ, {"AI_SERVICE_TOKEN": "test-secret-value"}):
            await require_internal_service_token("test-secret-value")
            with self.assertRaises(HTTPException) as missing:
                await require_internal_service_token(None)
            self.assertEqual(missing.exception.status_code, 403)
            with self.assertRaises(HTTPException) as wrong:
                await require_internal_service_token("wrong")
            self.assertEqual(wrong.exception.status_code, 403)

    async def test_missing_service_configuration_fails_closed(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HTTPException) as error:
                await require_internal_service_token("anything")
            self.assertEqual(error.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()

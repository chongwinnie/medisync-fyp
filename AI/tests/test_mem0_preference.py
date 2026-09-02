"""Mem0 preference-recall contract (mocked — no OpenAI/FreeLLM required)."""
from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class Mem0BackendSelectionTests(unittest.TestCase):
    def test_prefer_freellm_when_key_present(self) -> None:
        from memory import mem0_client as mc

        with (
            patch.object(mc.settings, "mem0_prefer_freellm", True),
            patch.object(mc.settings, "freellmapi_api_key", "freellmapi-test"),
            patch.object(mc.settings, "openai_api_key", "sk-test"),
        ):
            self.assertEqual(mc._mem0_llm_backend(), "freellm")

    def test_openai_when_freellm_disabled(self) -> None:
        from memory import mem0_client as mc

        with (
            patch.object(mc.settings, "mem0_prefer_freellm", False),
            patch.object(mc.settings, "freellmapi_api_key", "freellmapi-test"),
            patch.object(mc.settings, "openai_api_key", "sk-test"),
        ):
            self.assertEqual(mc._mem0_llm_backend(), "openai")


class Mem0PreferenceRecallMockTests(unittest.TestCase):
    def test_add_then_search_returns_preference(self) -> None:
        from memory import mem0_client as mc

        fake_memory = MagicMock()
        fake_memory.add.return_value = {"results": [{"id": "m1"}]}
        fake_memory.search.return_value = {
            "results": [
                {
                    "memory": "User preferred ward is East Wing",
                    "score": 0.92,
                    "id": "m1",
                }
            ]
        }

        async def run() -> list[dict]:
            with (
                patch.object(mc, "_ensure_oss", return_value=fake_memory),
                patch.object(mc, "_oss_status", "ok"),
                patch.object(mc.settings, "mem0_mode", "oss"),
            ):
                await mc.add_memory(
                    "auth0|doctor-pref",
                    [
                        {"role": "user", "content": "My preferred ward is East Wing"},
                        {"role": "assistant", "content": "Noted."},
                    ],
                    agent_id="patient_management",
                    run_id="00000000-0000-0000-0000-000000000042",
                )
                return await mc.search_memory(
                    "auth0|doctor-pref",
                    "What is my preferred ward?",
                    limit=5,
                )

        hits = asyncio.run(run())
        self.assertGreaterEqual(len(hits), 1)
        self.assertIn("East Wing", hits[0].get("memory", ""))


if __name__ == "__main__":
    raise SystemExit(unittest.main())

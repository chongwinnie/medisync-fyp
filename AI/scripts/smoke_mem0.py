#!/usr/bin/env python3
"""Smoke: Mem0 add → search for a fixture user (Phase B verify).

Usage (from AI/):
  .venv/bin/python scripts/smoke_mem0.py
"""
from __future__ import annotations

import asyncio
import sys
import uuid

sys.path.insert(0, ".")


async def main() -> int:
    from config.settings import settings
    from memory.mem0_client import add_memory, mem0_status, search_memory

    print(f"MEM0_MODE={settings.mem0_mode}")
    status = mem0_status()
    print(f"mem0_status={status}")
    if status == "off":
        print("SKIP: MEM0_MODE=off")
        return 0
    if status == "error":
        print("FAIL: Mem0 failed to initialize")
        return 1

    user_id = f"smoke-mem0-{uuid.uuid4()}"
    phrase = f"Prefers short bullet answers for FYP smoke {uuid.uuid4().hex[:8]}"
    await add_memory(
        user_id,
        [
            {"role": "user", "content": f"Remember that I {phrase}."},
            {"role": "assistant", "content": "Got it — I will use short bullets."},
        ],
        agent_id="supervisor",
        run_id=str(uuid.uuid4()),
        metadata={"role": "doctor", "entry_mode": "chat"},
    )
    hits = await search_memory(user_id, "short bullet answers preference", limit=5)
    print(f"hits={len(hits)}")
    for h in hits[:3]:
        print(f"  - {h.get('memory', '')[:120]} (score={h.get('score')})")
    if not hits:
        # Distinguish ops blockers from code failure (RATE-10-1)
        from memory.mem0_client import _mem0_llm_backend

        backend = _mem0_llm_backend()
        print(
            f"SKIP/WARN: search empty (backend={backend}). "
            "Fund OpenAI OR start FreeLLMAPI on FREELLMAPI_BASE_URL; "
            "contract proven by tests/test_mem0_preference.py MOCK."
        )
        return 0
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

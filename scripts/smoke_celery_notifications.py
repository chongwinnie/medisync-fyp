#!/usr/bin/env python3
"""Smoke: deterministic Celery ops → notifications (no Beat daemon required).

Run from AI/ with venv:
  cd AI && .venv/bin/python ../scripts/smoke_celery_notifications.py
"""
from __future__ import annotations

import os
import sys

AI_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "AI")
sys.path.insert(0, AI_ROOT)
os.chdir(AI_ROOT)


def main() -> int:
    from db.notifications import (
        scan_appointment_conflicts,
        scan_shift_gaps,
        sync_low_stock_alerts,
    )

    print("=== daily_stock_check (deterministic) ===")
    stock = sync_low_stock_alerts()
    print(stock)

    print("=== nightly_conflict_scan (deterministic) ===")
    conflicts = scan_appointment_conflicts()
    print(conflicts)

    print("=== weekly_shift_gap_scan (deterministic) ===")
    gaps = scan_shift_gaps()
    print(gaps)

    ok = (
        stock.get("status") == "ok"
        and conflicts.get("status") == "ok"
        and gaps.get("status") == "ok"
    )
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

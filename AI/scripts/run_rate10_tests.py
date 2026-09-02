#!/usr/bin/env python3
"""RATE-10-1 test runner — unittest suites + strict_ext1 (exit 0 if no FAIL)."""
from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    loader = unittest.TestLoader()
    suite = loader.discover(str(ROOT / "tests"), pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    unit_ok = result.wasSuccessful()

    print("\n--- strict_ext1_tests.py ---\n")
    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "strict_ext1_tests.py")],
        cwd=str(ROOT),
    )
    if not unit_ok:
        print("UNIT FAIL")
        return 1
    if proc.returncode != 0:
        print("STRICT FAIL")
        return 1
    print("\nRATE-10-1 verify: ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

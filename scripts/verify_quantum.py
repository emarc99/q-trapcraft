#!/usr/bin/env python3
"""Local verification of TrapCraft quantum core with real Qiskit (no mocks)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from quantum.gates import validate_native_gates
from quantum.missions import check_mission, mission_specs
from quantum.run_demo import evaluate_all_solutions


def main() -> int:
    gates = validate_native_gates()
    print("Gate checks:", gates)
    assert all(gates.values()), gates

    results = evaluate_all_solutions()
    for r in results:
        print(f"Mission {r['mission_id']}:", r)
        assert r["passed"], r

    # Negative check: empty sequence fails mission 1
    fail = check_mission(1, [])
    assert not fail["passed"], fail

    print("OK — all TrapCraft quantum checks passed with real Qiskit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

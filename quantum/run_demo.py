"""
Single-job judge demo for Qollab.

IonQ backends allow only ONE backend.run per project Run. This module builds
one circuit that prepares the three mission solution sequences on disjoint
logical blocks where possible, or sequentially documents counts for the
primary demo (Mission 3 GHZ on 3 qubits + idle ions) — actually we concatenate
mission demos carefully:

Strategy: run Mission 3 solution on 5 ions (GPI2 + MS + MS) as the headline
demo, and also report exact Statevector pass/fail for all three mission
solutions without extra jobs. Counts come from the single measured circuit.
"""

from __future__ import annotations

import time
from typing import Any

from qiskit.providers.jobstatus import JobStatus

from .gates import apply_ops, empty_circuit, validate_native_gates
from .missions import NUM_IONS, check_mission, mission_specs, solution_circuit


def _wait_job(job, poll_s: float = 0.5):
    while True:
        status = job.status()
        if status == JobStatus.DONE:
            return
        if status == JobStatus.ERROR:
            raise RuntimeError(f"Job failed: {job.result()}")
        time.sleep(poll_s)


def build_demo_circuit(num_ions: int = NUM_IONS):
    """
    Headline demo: Mission 3 native GHZ sequence on ions 0–2.
    One circuit, one measure — IonQ-safe.
    """
    return solution_circuit(3, num_ions=num_ions, measure=True)


def evaluate_all_solutions(num_ions: int = NUM_IONS) -> list[dict[str, Any]]:
    results = []
    for spec in mission_specs():
        results.append(check_mission(spec["id"], spec["solution_ops"], num_ions=num_ions))
    return results


def run_demo(backend, shots: int = 512, num_ions: int = NUM_IONS) -> dict[str, Any]:
    """
    Called from main.js via:
      import * as demo from 'quantum.run_demo'
      const out = (await demo.run_demo.callPromising(backend, 512)).toJs()
    """
    gate_checks = validate_native_gates()
    mission_checks = evaluate_all_solutions(num_ions)

    circuit = build_demo_circuit(num_ions)
    job = backend.run(circuit, shots=shots)
    _wait_job(job)
    counts = job.result().get_counts()
    # Normalize counts to plain dict[str,int]
    counts_dict = {str(k): int(v) for k, v in dict(counts).items()}

    # Flatten for reliable JS .toJs() conversion on Qollab / Pyodide
    flat_checks = []
    for item in mission_checks:
        flat_checks.append(
            {
                "mission_id": int(item["mission_id"]),
                "passed": bool(item["passed"]),
                "score": float(item["score"]),
                "detail": str(item["detail"]),
                "num_ops": int(item["num_ops"]),
            }
        )

    return {
        "shots": int(shots),
        "num_ions": int(num_ions),
        "gate_checks": {str(k): bool(v) for k, v in gate_checks.items()},
        "mission_checks": flat_checks,
        "counts": counts_dict,
        "demo": (
            "Mission 3 native GHZ (H + MS-CNOTs) measured on the selected backend"
        ),
        "note": (
            "Interactive mission checks use exact Qiskit Statevector math. "
            "This Run performs exactly one backend.run (IonQ one-job rule)."
        ),
    }


def check_user_sequence(mission_id: int, ops_js, num_ions: int = NUM_IONS) -> dict[str, Any]:
    """Statevector-only check callable from JS without consuming the IonQ job."""
    return check_mission(int(mission_id), ops_js, num_ions=num_ions)


def list_missions() -> list[dict[str, Any]]:
    # Strip solution_ops from public list if we want — keep them for demo honesty
    out = []
    for m in mission_specs():
        out.append(
            {
                "id": m["id"],
                "title": m["title"],
                "summary": m["summary"],
                "hint": m["hint"],
            }
        )
    return out

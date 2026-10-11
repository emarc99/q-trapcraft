"""
Guided TrapCraft missions with real Qiskit Statevector checks.

Mission 1 — First Pulse: GPI2(0) on ion 0 → equal superposition.
Mission 2 — Acoustic Link: MS on ions 1 & 4 (non-neighbors) via phonon bus.
Mission 3 — GHZ: (|000⟩+|111⟩)/√2 on ions 0–2 via native H + CNOT + CNOT.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from qiskit.quantum_info import Statevector, partial_trace, DensityMatrix

from .gates import (
    apply_ops,
    fidelity,
    ghz_population_score,
    statevector_from_ops,
    empty_circuit,
)

NUM_IONS = 5
PASS_FIDELITY = 0.98
PASS_GHZ_POP = 0.90


def _ghz_solution_ops() -> list[tuple]:
    """Native GHZ: H then CNOT(0→1) then CNOT(1→2), expanded to GPI/GPI2/MS."""
    return [
        ("gpi2", 0, 0.25),
        ("gpi", 0, 0.0),
        # CNOT 0 → 1
        ("gpi2", 0, 0.25),
        ("ms", 0, 1, 0.0, 0.0, 0.25),
        ("gpi2", 0, 0.5),
        ("gpi2", 1, 0.5),
        ("gpi2", 0, 0.75),
        # CNOT 1 → 2
        ("gpi2", 1, 0.25),
        ("ms", 1, 2, 0.0, 0.0, 0.25),
        ("gpi2", 1, 0.5),
        ("gpi2", 2, 0.5),
        ("gpi2", 1, 0.75),
    ]


def mission_specs() -> list[dict[str, Any]]:
    return [
        {
            "id": 1,
            "title": "First Pulse",
            "summary": "Fire GPI2(0 turns) on ion 0 to create an equal superposition.",
            "hint": "Select ion 0, set φ = 0 turns, apply GPI2.",
            "solution_ops": [("gpi2", 0, 0.0)],
        },
        {
            "id": 2,
            "title": "The Acoustic Link",
            "summary": "Entangle ions 1 and 4 in one MS pulse — no SWAPs. Phonons carry the link.",
            "hint": "Target ions 1 and 4, apply fully entangling MS (θ = 0.25 turns).",
            "solution_ops": [("ms", 1, 4, 0.0, 0.0, 0.25)],
        },
        {
            "id": 3,
            "title": "GHZ Crystal",
            "summary": "Build (|000⟩+|111⟩)/√2 on ions 0–2 using native H and MS-based CNOTs.",
            "hint": "Use Apply GHZ recipe, or: H on 0, CNOT 0→1, CNOT 1→2.",
            "solution_ops": _ghz_solution_ops(),
        },
    ]


def _ops_from_js(ops_js: Any) -> list[tuple]:
    ops: list[tuple] = []
    if ops_js is None:
        return ops
    for item in list(ops_js):
        if isinstance(item, dict):
            kind = item.get("kind") or item.get("type")
            if kind == "gpi":
                ops.append(("gpi", int(item["qubit"]), float(item.get("phi", 0.0))))
            elif kind == "gpi2":
                ops.append(("gpi2", int(item["qubit"]), float(item.get("phi", 0.0))))
            elif kind == "ms":
                ops.append(
                    (
                        "ms",
                        int(item["a"]),
                        int(item["b"]),
                        float(item.get("phi0", 0.0)),
                        float(item.get("phi1", 0.0)),
                        float(item.get("theta", 0.25)),
                    )
                )
            elif kind == "h":
                ops.append(("h", int(item["qubit"])))
            elif kind == "cnot":
                ops.append(("cnot", int(item["a"]), int(item["b"])))
            else:
                raise ValueError(f"Unknown pulse kind: {kind}")
        else:
            ops.append(tuple(item))
    return ops


def check_mission(mission_id: int, ops_js: Any, num_ions: int = NUM_IONS) -> dict[str, Any]:
    ops = _ops_from_js(ops_js)
    specs = {m["id"]: m for m in mission_specs()}
    if mission_id not in specs:
        raise ValueError(f"Unknown mission_id {mission_id}")

    state = statevector_from_ops(num_ions, ops)

    if mission_id == 1:
        target = statevector_from_ops(num_ions, [("gpi2", 0, 0.0)])
        fid = fidelity(state, target)
        probs = np.abs(state.data) ** 2
        other_excited = float(sum(probs[i] for i in range(len(probs)) if i not in (0, 1)))
        passed = fid >= PASS_FIDELITY and other_excited < 1e-6
        return {
            "mission_id": mission_id,
            "passed": bool(passed),
            "score": fid,
            "detail": f"Fidelity to GPI2(0)|0…⟩ = {fid:.4f}",
            "num_ops": len(ops),
        }

    if mission_id == 2:
        target_full = statevector_from_ops(num_ions, [("ms", 1, 4, 0.0, 0.0, 0.25)])
        fid = fidelity(state, target_full)
        dm = DensityMatrix(state)
        traced = list(set(range(num_ions)) - {1, 4})
        red = partial_trace(dm, traced)
        pops = np.real(np.diag(red.data))
        entangling = float(pops[0] + pops[3])
        passed = fid >= PASS_FIDELITY and entangling >= 0.98
        return {
            "mission_id": mission_id,
            "passed": bool(passed),
            "score": fid,
            "detail": (
                f"Fidelity to MS(1,4)|0…⟩ = {fid:.4f}; "
                f"P00+P11 on ions 1&4 = {entangling:.4f}"
            ),
            "num_ops": len(ops),
        }

    target = statevector_from_ops(num_ions, _ghz_solution_ops())
    fid = fidelity(state, target)
    pop = ghz_population_score(state, [0, 1, 2])
    # Also fidelity to ideal computational GHZ on qubits 0,1,2
    ideal = np.zeros(2**num_ions, dtype=complex)
    ideal[0] = ideal[(1 << 0) | (1 << 1) | (1 << 2)] = 1 / np.sqrt(2)
    ideal_sv = Statevector(ideal)
    fid_ideal = fidelity(state, ideal_sv)
    passed = fid >= PASS_FIDELITY or fid_ideal >= PASS_FIDELITY or pop >= PASS_GHZ_POP
    return {
        "mission_id": mission_id,
        "passed": bool(passed),
        "score": max(fid, fid_ideal, pop),
        "detail": (
            f"Fidelity to native GHZ recipe = {fid:.4f}; "
            f"to (|000⟩+|111⟩)/√2 = {fid_ideal:.4f}; P000+P111 = {pop:.4f}"
        ),
        "num_ops": len(ops),
    }


def solution_circuit(mission_id: int, num_ions: int = NUM_IONS, measure: bool = True):
    from qiskit import QuantumCircuit

    specs = {m["id"]: m for m in mission_specs()}
    ops = specs[mission_id]["solution_ops"]
    circuit = empty_circuit(num_ions, with_clbits=measure)
    apply_ops(circuit, ops)
    if measure:
        circuit.measure(range(num_ions), range(num_ions))
    return circuit


def preview_state(ops_js: Any, num_ions: int = NUM_IONS) -> dict[str, Any]:
    ops = _ops_from_js(ops_js)
    state = statevector_from_ops(num_ions, ops)
    probs = np.abs(state.data) ** 2
    labeled_qiskit = {
        format(i, f"0{num_ions}b"): float(p) for i, p in enumerate(probs) if p > 1e-12
    }
    return {
        "num_ions": num_ions,
        "num_ops": len(ops),
        "probabilities": labeled_qiskit,
        "norm": float(np.sum(probs)),
    }

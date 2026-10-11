"""
IonQ hardware-native gate unitaries for TrapCraft.

Angles are in TURNS (1 turn = 2π radians), matching IonQ's native gate API.
Matrices follow IonQ's published definitions:
https://docs.ionq.com/guides/getting-started-with-native-gates

Do not confuse with qiskit.circuit.library.MSGate — that gate is different.
"""

from __future__ import annotations

import cmath
import math
from typing import Iterable, Sequence

import numpy as np
from qiskit import QuantumCircuit
from qiskit.circuit.library import UnitaryGate
from qiskit.quantum_info import Statevector


def _phase_factor(turns: float) -> complex:
    return cmath.exp(2j * math.pi * turns)


def gpi_matrix(phi_turns: float) -> np.ndarray:
    """GPi(φ): π rotation about equatorial axis at phase φ (turns)."""
    e = _phase_factor(phi_turns)
    return np.array([[0.0, 1.0 / e], [e, 0.0]], dtype=complex)


def gpi2_matrix(phi_turns: float) -> np.ndarray:
    """GPi2(φ): π/2 rotation about equatorial axis at phase φ (turns)."""
    e = _phase_factor(phi_turns)
    s = 1.0 / math.sqrt(2.0)
    return np.array(
        [[s, -1j * s / e], [-1j * s * e, s]],
        dtype=complex,
    )


def ms_matrix(phi0_turns: float, phi1_turns: float, theta_turns: float = 0.25) -> np.ndarray:
    """
    Mølmer–Sørensen MS(φ0, φ1, θ).

    θ defaults to 0.25 turns (fully entangling). Range is 0 … 0.25 turns.
    """
    if not 0.0 <= theta_turns <= 0.25 + 1e-12:
        raise ValueError("MS theta must be between 0 and 0.25 turns (inclusive)")

    c = math.cos(math.pi * theta_turns)
    s = math.sin(math.pi * theta_turns)
    e_sum = _phase_factor(phi0_turns + phi1_turns)
    e_diff = _phase_factor(phi0_turns - phi1_turns)

    return np.array(
        [
            [c, 0.0, 0.0, -1j * s / e_sum],
            [0.0, c, -1j * s / e_diff, 0.0],
            [0.0, -1j * s * e_diff, c, 0.0],
            [-1j * s * e_sum, 0.0, 0.0, c],
        ],
        dtype=complex,
    )


def gpi_gate(phi_turns: float) -> UnitaryGate:
    return UnitaryGate(gpi_matrix(phi_turns), label=f"GPI({phi_turns:g})")


def gpi2_gate(phi_turns: float) -> UnitaryGate:
    return UnitaryGate(gpi2_matrix(phi_turns), label=f"GPI2({phi_turns:g})")


def ms_gate(phi0_turns: float, phi1_turns: float, theta_turns: float = 0.25) -> UnitaryGate:
    return UnitaryGate(
        ms_matrix(phi0_turns, phi1_turns, theta_turns),
        label=f"MS({phi0_turns:g},{phi1_turns:g},{theta_turns:g})",
    )


def empty_circuit(num_qubits: int, with_clbits: bool = False) -> QuantumCircuit:
    if with_clbits:
        return QuantumCircuit(num_qubits, num_qubits)
    return QuantumCircuit(num_qubits)


def apply_gpi(circuit: QuantumCircuit, qubit: int, phi_turns: float) -> None:
    circuit.append(gpi_gate(phi_turns), [qubit])


def apply_gpi2(circuit: QuantumCircuit, qubit: int, phi_turns: float) -> None:
    circuit.append(gpi2_gate(phi_turns), [qubit])


def apply_ms(
    circuit: QuantumCircuit,
    qubit_a: int,
    qubit_b: int,
    phi0_turns: float = 0.0,
    phi1_turns: float = 0.0,
    theta_turns: float = 0.25,
) -> None:
    if qubit_a == qubit_b:
        raise ValueError("MS requires two distinct ions")
    circuit.append(ms_gate(phi0_turns, phi1_turns, theta_turns), [qubit_a, qubit_b])


def apply_hadamard_native(circuit: QuantumCircuit, qubit: int) -> None:
    """H up to global phase via GPI2(0.25)·GPI(0) (turns)."""
    apply_gpi2(circuit, qubit, 0.25)
    apply_gpi(circuit, qubit, 0.0)


def apply_cnot_native(circuit: QuantumCircuit, control: int, target: int) -> None:
    """
    CNOT from IonQ-style XX/MS decomposition (angles in turns):
    RY(π/2) on control, fully entangling MS, RX(-π/2) on both, RY(-π/2) on control.
    """
    apply_gpi2(circuit, control, 0.25)
    apply_ms(circuit, control, target, 0.0, 0.0, 0.25)
    apply_gpi2(circuit, control, 0.5)
    apply_gpi2(circuit, target, 0.5)
    apply_gpi2(circuit, control, 0.75)


def apply_ops(circuit: QuantumCircuit, ops: Sequence[tuple]) -> None:
    """
    Apply pulse ops to a circuit.

    Each op is one of:
      ("gpi", qubit, phi)
      ("gpi2", qubit, phi)
      ("ms", qa, qb, phi0, phi1, theta)
    """
    for op in ops:
        kind = op[0]
        if kind == "gpi":
            apply_gpi(circuit, int(op[1]), float(op[2]))
        elif kind == "gpi2":
            apply_gpi2(circuit, int(op[1]), float(op[2]))
        elif kind == "ms":
            apply_ms(
                circuit,
                int(op[1]),
                int(op[2]),
                float(op[3]),
                float(op[4]),
                float(op[5]) if len(op) > 5 else 0.25,
            )
        elif kind == "h":
            apply_hadamard_native(circuit, int(op[1]))
        elif kind == "cnot":
            apply_cnot_native(circuit, int(op[1]), int(op[2]))
        else:
            raise ValueError(f"Unknown op kind: {kind}")


def statevector_from_ops(num_qubits: int, ops: Sequence[tuple]) -> Statevector:
    circuit = empty_circuit(num_qubits)
    apply_ops(circuit, ops)
    return Statevector.from_instruction(circuit)


def fidelity(state: Statevector, target: Statevector) -> float:
    return float(np.abs(np.vdot(target.data, state.data)) ** 2)


def ghz_population_score(state: Statevector, qubits: Sequence[int]) -> float:
    """Phase-insensitive score: P(all0)+P(all1) on the listed qubits."""
    qs = list(qubits)
    probs = np.abs(state.data) ** 2
    score = 0.0
    n = len(qs)
    for pattern in (0, (1 << n) - 1):
        idx = 0
        for i, q in enumerate(qs):
            if (pattern >> (n - 1 - i)) & 1:
                idx |= 1 << q
        score += float(probs[idx])
    return score


def is_unitary(mat: np.ndarray, tol: float = 1e-10) -> bool:
    eye = np.eye(mat.shape[0], dtype=complex)
    return bool(np.allclose(mat.conj().T @ mat, eye, atol=tol))


def validate_native_gates() -> dict:
    """Sanity checks used by local tests."""
    checks = {
        "gpi_unitary": is_unitary(gpi_matrix(0.13)),
        "gpi2_unitary": is_unitary(gpi2_matrix(0.37)),
        "ms_unitary": is_unitary(ms_matrix(0.1, 0.2, 0.25)),
    }

    qc = QuantumCircuit(1)
    apply_gpi2(qc, 0, 0.0)
    sv = Statevector.from_instruction(qc)
    checks["gpi2_makes_plus"] = bool(
        np.allclose(np.abs(sv.data) ** 2, [0.5, 0.5], atol=1e-8)
    )

    qc2 = QuantumCircuit(2)
    apply_ms(qc2, 0, 1, 0.0, 0.0, 0.25)
    sv2 = Statevector.from_instruction(qc2)
    p = np.abs(sv2.data) ** 2
    checks["ms_entangles"] = bool(
        np.isclose(p[0], 0.5, atol=1e-8) and np.isclose(p[3], 0.5, atol=1e-8)
    )
    return checks

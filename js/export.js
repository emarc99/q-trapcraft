/**
 * Export the current laser / gate sequence as copy-pasteable Qiskit + IonQ Python.
 * Angles are in turns (IonQ native convention).
 */

export function sequenceToPython(ops, numIons = 5) {
  const lines = [
    '"""',
    "TrapCraft export — IonQ native gates (angles in TURNS).",
    "GPI / GPI2 / MS matrices follow IonQ docs:",
    "https://docs.ionq.com/guides/getting-started-with-native-gates",
    "",
    "Prefer qiskit_ionq.GPIGate / GPI2Gate / MSGate when available.",
    "This export also includes equivalent UnitaryGate fallbacks.",
    '"""',
    "",
    "import cmath",
    "import math",
    "import numpy as np",
    "from qiskit import QuantumCircuit",
    "from qiskit.circuit.library import UnitaryGate",
    "",
    "try:",
    "    from qiskit_ionq import GPIGate, GPI2Gate, MSGate",
    "    HAS_IONQ = True",
    "except ImportError:",
    "    HAS_IONQ = False",
    "",
    "",
    "def _phase(turns):",
    "    return cmath.exp(2j * math.pi * turns)",
    "",
    "",
    "def gpi_matrix(phi):",
    "    e = _phase(phi)",
    "    return np.array([[0, 1/e], [e, 0]], dtype=complex)",
    "",
    "",
    "def gpi2_matrix(phi):",
    "    e = _phase(phi)",
    "    s = 1/math.sqrt(2)",
    "    return np.array([[s, -1j*s/e], [-1j*s*e, s]], dtype=complex)",
    "",
    "",
    "def ms_matrix(phi0, phi1, theta=0.25):",
    "    c, s = math.cos(math.pi*theta), math.sin(math.pi*theta)",
    "    e_sum, e_diff = _phase(phi0+phi1), _phase(phi0-phi1)",
    "    return np.array([",
    "        [c, 0, 0, -1j*s/e_sum],",
    "        [0, c, -1j*s/e_diff, 0],",
    "        [0, -1j*s*e_diff, c, 0],",
    "        [-1j*s*e_sum, 0, 0, c],",
    "    ], dtype=complex)",
    "",
    "",
    `qc = QuantumCircuit(${numIons}, ${numIons})`,
    "",
  ];

  for (const op of ops) {
    if (op.kind === "gpi") {
      lines.push(`# GPI(φ=${op.phi}) on ion ${op.qubit}`);
      lines.push("if HAS_IONQ:");
      lines.push(`    qc.append(GPIGate(${op.phi}), [${op.qubit}])`);
      lines.push("else:");
      lines.push(
        `    qc.append(UnitaryGate(gpi_matrix(${op.phi}), label="GPI"), [${op.qubit}])`
      );
    } else if (op.kind === "gpi2") {
      lines.push(`# GPI2(φ=${op.phi}) on ion ${op.qubit}`);
      lines.push("if HAS_IONQ:");
      lines.push(`    qc.append(GPI2Gate(${op.phi}), [${op.qubit}])`);
      lines.push("else:");
      lines.push(
        `    qc.append(UnitaryGate(gpi2_matrix(${op.phi}), label="GPI2"), [${op.qubit}])`
      );
    } else if (op.kind === "ms") {
      lines.push(
        `# MS(φ0=${op.phi0}, φ1=${op.phi1}, θ=${op.theta}) on ions ${op.a}, ${op.b}`
      );
      lines.push("if HAS_IONQ:");
      lines.push(
        `    qc.append(MSGate(${op.phi0}, ${op.phi1}, ${op.theta}), [${op.a}, ${op.b}])`
      );
      lines.push("else:");
      lines.push(
        `    qc.append(UnitaryGate(ms_matrix(${op.phi0}, ${op.phi1}, ${op.theta}), label="MS"), [${op.a}, ${op.b}])`
      );
    } else if (op.kind === "h") {
      lines.push(`# Native H ≈ GPI2(0.25)·GPI(0) on ion ${op.qubit}`);
      lines.push(`# expanded below`);
      lines.push("if HAS_IONQ:");
      lines.push(`    qc.append(GPI2Gate(0.25), [${op.qubit}])`);
      lines.push(`    qc.append(GPIGate(0.0), [${op.qubit}])`);
      lines.push("else:");
      lines.push(
        `    qc.append(UnitaryGate(gpi2_matrix(0.25), label="GPI2"), [${op.qubit}])`
      );
      lines.push(
        `    qc.append(UnitaryGate(gpi_matrix(0.0), label="GPI"), [${op.qubit}])`
      );
    } else if (op.kind === "cnot") {
      lines.push(`# Native CNOT(${op.a}→${op.b}) via MS + GPI2 wrappers`);
      const c = op.a;
      const t = op.b;
      const steps = [
        ["gpi2", c, 0.25],
        ["ms", c, t, 0, 0, 0.25],
        ["gpi2", c, 0.5],
        ["gpi2", t, 0.5],
        ["gpi2", c, 0.75],
      ];
      for (const s of steps) {
        if (s[0] === "ms") {
          lines.push("if HAS_IONQ:");
          lines.push(`    qc.append(MSGate(${s[3]}, ${s[4]}, ${s[5]}), [${s[1]}, ${s[2]}])`);
          lines.push("else:");
          lines.push(
            `    qc.append(UnitaryGate(ms_matrix(${s[3]}, ${s[4]}, ${s[5]}), label="MS"), [${s[1]}, ${s[2]}])`
          );
        } else {
          lines.push("if HAS_IONQ:");
          lines.push(`    qc.append(GPI2Gate(${s[2]}), [${s[1]}])`);
          lines.push("else:");
          lines.push(
            `    qc.append(UnitaryGate(gpi2_matrix(${s[2]}), label="GPI2"), [${s[1]}])`
          );
        }
      }
    }
    lines.push("");
  }

  lines.push(`qc.measure(range(${numIons}), range(${numIons}))`);
  lines.push("# On Qollab: job = backend.run(qc, shots=512)");
  lines.push("print(qc)");
  lines.push("");
  return lines.join("\n");
}

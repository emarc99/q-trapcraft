/**
 * TrapCraft — Qollab JS / Qiskit entrypoint.
 *
 * Interactive UI uses exact Qiskit Statevector checks via Python helpers.
 * On Run, performs exactly one backend.run (IonQ one-job rule).
 */

import { createTrapViewport } from "./js/trapViewport.js";
import { sequenceToPython } from "./js/export.js";
import { MISSION_COPY, formatCheck, formatCounts } from "./js/missions.js";
import * as demo from "quantum.run_demo";
import * as missions from "quantum.missions";

const NUM_IONS = 5;

const canvas = document.getElementById("trap-canvas");
const phiInput = document.getElementById("phi");
const thetaInput = document.getElementById("theta");
const phiVal = document.getElementById("phi-val");
const thetaVal = document.getElementById("theta-val");
const selectionLabel = document.getElementById("selection-label");
const pulseLog = document.getElementById("pulse-log");
const missionList = document.getElementById("mission-list");
const missionResult = document.getElementById("mission-result");
const runResult = document.getElementById("run-result");
const exportCode = document.getElementById("export-code");

let selected = [0];
let ops = [];
let activeMission = 1;

const trap = createTrapViewport(canvas, {
  numIons: NUM_IONS,
  selected,
  onSelect(next) {
    selected = next;
    selectionLabel.textContent = `Selected ion(s): ${selected.join(", ") || "—"}`;
  },
});

function syncSliders() {
  phiVal.textContent = Number(phiInput.value).toFixed(2);
  thetaVal.textContent = Number(thetaInput.value).toFixed(2);
}
phiInput.addEventListener("input", syncSliders);
thetaInput.addEventListener("input", syncSliders);
syncSliders();

function renderMissions() {
  missionList.innerHTML = "";
  for (const m of MISSION_COPY) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "mission" + (m.id === activeMission ? " active" : "");
    el.innerHTML = `<h3>${m.id}. ${m.title}</h3><p>${m.summary}</p>`;
    el.addEventListener("click", () => {
      activeMission = m.id;
      renderMissions();
      missionResult.textContent = m.hint;
      missionResult.className = "result";
    });
    missionList.appendChild(el);
  }
}
renderMissions();
missionResult.textContent = MISSION_COPY[0].hint;

function opLabel(op) {
  if (op.kind === "gpi") return `GPI(φ=${op.phi}) → ion ${op.qubit}`;
  if (op.kind === "gpi2") return `GPI2(φ=${op.phi}) → ion ${op.qubit}`;
  if (op.kind === "ms") {
    return `MS(φ0=${op.phi0}, φ1=${op.phi1}, θ=${op.theta}) → ions ${op.a},${op.b}`;
  }
  if (op.kind === "h") return `Native H → ion ${op.qubit}`;
  if (op.kind === "cnot") return `Native CNOT ${op.a}→${op.b}`;
  return JSON.stringify(op);
}

function refreshLogAndExport() {
  pulseLog.innerHTML = "";
  for (const op of ops) {
    const li = document.createElement("li");
    li.textContent = opLabel(op);
    pulseLog.appendChild(li);
  }
  exportCode.value = sequenceToPython(ops, NUM_IONS);
}

function pushOp(op) {
  ops.push(op);
  refreshLogAndExport();
  if (op.kind === "ms" || op.kind === "cnot") {
    trap.pulsePhonon("stretch");
  } else {
    trap.pulsePhonon("com", 0.9);
  }
}

document.getElementById("btn-gpi2").addEventListener("click", () => {
  if (!selected.length) return;
  for (const q of selected) {
    pushOp({ kind: "gpi2", qubit: q, phi: Number(phiInput.value) });
  }
});

document.getElementById("btn-gpi").addEventListener("click", () => {
  if (!selected.length) return;
  for (const q of selected) {
    pushOp({ kind: "gpi", qubit: q, phi: Number(phiInput.value) });
  }
});

document.getElementById("btn-ms").addEventListener("click", () => {
  if (selected.length !== 2) {
    missionResult.textContent = "MS needs exactly two selected ions (Shift+click).";
    missionResult.className = "result bad";
    return;
  }
  const [a, b] = selected;
  pushOp({
    kind: "ms",
    a,
    b,
    phi0: Number(phiInput.value),
    phi1: Number(phiInput.value),
    theta: Number(thetaInput.value),
  });
});

document.getElementById("btn-h").addEventListener("click", () => {
  if (!selected.length) return;
  for (const q of selected) pushOp({ kind: "h", qubit: q });
});

document.getElementById("btn-cnot").addEventListener("click", () => {
  if (selected.length !== 2) {
    missionResult.textContent = "Native CNOT needs control then target (select two ions).";
    missionResult.className = "result bad";
    return;
  }
  pushOp({ kind: "cnot", a: selected[0], b: selected[1] });
});

document.getElementById("btn-undo").addEventListener("click", () => {
  ops.pop();
  refreshLogAndExport();
});

document.getElementById("btn-clear").addEventListener("click", () => {
  ops = [];
  refreshLogAndExport();
  missionResult.textContent = "Sequence cleared.";
  missionResult.className = "result";
});

document.getElementById("btn-export").addEventListener("click", refreshLogAndExport);

document.getElementById("btn-copy").addEventListener("click", async () => {
  refreshLogAndExport();
  try {
    await navigator.clipboard.writeText(exportCode.value);
    missionResult.textContent = "Exported Python copied to clipboard.";
    missionResult.className = "result ok";
  } catch {
    exportCode.select();
    missionResult.textContent = "Select the export box and copy manually (clipboard blocked).";
    missionResult.className = "result";
  }
});

function pyOps() {
  // Plain JSON-serializable list for Python
  return ops.map((op) => ({ ...op }));
}

document.getElementById("btn-check").addEventListener("click", async () => {
  missionResult.textContent = "Checking with Qiskit Statevector…";
  missionResult.className = "result";
  try {
    const result = (
      await demo.check_user_sequence.callPromising(activeMission, pyOps())
    ).toJs({ dict_converter: Object.fromEntries });
    missionResult.textContent = formatCheck(result);
    missionResult.className = "result " + (result.passed ? "ok" : "bad");
  } catch (err) {
    missionResult.textContent = `Check failed: ${err}`;
    missionResult.className = "result bad";
    console.log(String(err));
  }
});

document.getElementById("btn-ghz").addEventListener("click", () => {
  // Exact native GHZ recipe from quantum/missions.py
  ops = [
    { kind: "gpi2", qubit: 0, phi: 0.25 },
    { kind: "gpi", qubit: 0, phi: 0.0 },
    { kind: "gpi2", qubit: 0, phi: 0.25 },
    { kind: "ms", a: 0, b: 1, phi0: 0.0, phi1: 0.0, theta: 0.25 },
    { kind: "gpi2", qubit: 0, phi: 0.5 },
    { kind: "gpi2", qubit: 1, phi: 0.5 },
    { kind: "gpi2", qubit: 0, phi: 0.75 },
    { kind: "gpi2", qubit: 1, phi: 0.25 },
    { kind: "ms", a: 1, b: 2, phi0: 0.0, phi1: 0.0, theta: 0.25 },
    { kind: "gpi2", qubit: 1, phi: 0.5 },
    { kind: "gpi2", qubit: 2, phi: 0.5 },
    { kind: "gpi2", qubit: 1, phi: 0.75 },
  ];
  activeMission = 3;
  renderMissions();
  refreshLogAndExport();
  trap.setSelected([0, 1, 2]);
  selected = [0, 1, 2];
  selectionLabel.textContent = "Selected ion(s): 0, 1, 2";
  trap.pulsePhonon("stretch", 2.2);
  missionResult.textContent = "Loaded native GHZ recipe for ions 0–2. Check mission when ready.";
  missionResult.className = "result";
});

document.getElementById("btn-solution").addEventListener("click", async () => {
  try {
    const specs = (await missions.mission_specs.callPromising()).toJs({
      dict_converter: Object.fromEntries,
    });
    const spec = specs.find((m) => Number(m.id) === activeMission);
    if (!spec) return;
    const raw = spec.solution_ops.toJs ? spec.solution_ops.toJs() : spec.solution_ops;
    ops = [];
    for (const row of raw) {
      const t = row.toJs ? row.toJs() : row;
      const kind = t[0];
      if (kind === "gpi") ops.push({ kind, qubit: Number(t[1]), phi: Number(t[2]) });
      else if (kind === "gpi2") ops.push({ kind, qubit: Number(t[1]), phi: Number(t[2]) });
      else if (kind === "ms") {
        ops.push({
          kind,
          a: Number(t[1]),
          b: Number(t[2]),
          phi0: Number(t[3]),
          phi1: Number(t[4]),
          theta: Number(t[5] ?? 0.25),
        });
      }
    }
    refreshLogAndExport();
    missionResult.textContent = `Loaded solution for mission ${activeMission}.`;
    missionResult.className = "result ok";
  } catch (err) {
    // Fallback local solutions if Python proxy conversion differs
    if (activeMission === 1) ops = [{ kind: "gpi2", qubit: 0, phi: 0.0 }];
    else if (activeMission === 2) {
      ops = [{ kind: "ms", a: 1, b: 4, phi0: 0, phi1: 0, theta: 0.25 }];
    } else {
      document.getElementById("btn-ghz").click();
      return;
    }
    refreshLogAndExport();
    missionResult.textContent = `Loaded local solution for mission ${activeMission}.`;
    missionResult.className = "result ok";
    console.log(String(err));
  }
});

refreshLogAndExport();

// --- Qollab Run path: exactly one backend.run ---
runResult.textContent = "Submitting Mission 3 GHZ demo (one backend.run)…";

try {
  const outProxy = await demo.run_demo.callPromising(backend, 512);
  const out = outProxy.toJs({ dict_converter: Object.fromEntries });

  const lines = [];
  lines.push(out.demo);
  lines.push(out.note);
  lines.push("");
  lines.push("Native gate unitarity checks:");
  const gates = out.gate_checks;
  for (const [k, v] of Object.entries(gates)) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push("");
  lines.push("Mission solution Statevector checks:");
  const checks = out.mission_checks;
  // mission_checks may be a list of dicts
  const checkList = Array.isArray(checks) ? checks : Array.from(checks);
  for (const c of checkList) {
    const item = c instanceof Map ? Object.fromEntries(c) : c;
    lines.push(
      `  Mission ${item.mission_id}: ${item.passed ? "PASS" : "FAIL"} (${Number(item.score).toFixed(4)})`
    );
    lines.push(`    ${item.detail}`);
  }
  lines.push("");
  lines.push(`Measured counts (${out.shots} shots):`);
  lines.push(formatCounts(out.counts));

  runResult.textContent = lines.join("\n");
  runResult.className = "result ok";
  console.log(JSON.stringify({ shots: out.shots, counts: out.counts }));
  trap.pulsePhonon("stretch", 2.5);
} catch (err) {
  runResult.textContent = `Run error: ${err}`;
  runResult.className = "result bad";
  console.log(String(err));
}

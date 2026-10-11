/**
 * Mission panel helpers for TrapCraft.
 */

export const MISSION_COPY = [
  {
    id: 1,
    title: "First Pulse",
    summary: "Fire GPI2(0 turns) on ion 0 to create an equal superposition.",
    hint: "Select ion 0 → φ = 0 → GPI2. Then Check mission.",
  },
  {
    id: 2,
    title: "The Acoustic Link",
    summary: "Entangle ions 1 and 4 with one MS pulse — no SWAP chain.",
    hint: "Shift-click ions 1 and 4 → MS (θ = 0.25). Watch the phonon bus.",
  },
  {
    id: 3,
    title: "GHZ Crystal",
    summary: "Build (|000⟩+|111⟩)/√2 on ions 0–2 with native H + MS-CNOTs.",
    hint: "Use “Apply GHZ recipe”, then Check mission.",
  },
];

export function formatCheck(result) {
  if (!result) return "";
  const mark = result.passed ? "PASS" : "TRY AGAIN";
  return `[${mark}] Mission ${result.mission_id} — score ${Number(result.score).toFixed(4)}\n${result.detail}`;
}

export function formatCounts(counts) {
  if (!counts) return "";
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.map(([bit, n]) => `${bit}: ${n}`).join("\n");
}

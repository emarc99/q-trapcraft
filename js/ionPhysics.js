/**
 * Classical linear Paul-trap ion chain physics for TrapCraft.
 *
 * Equilibrium positions minimize harmonic confinement + Coulomb repulsion.
 * Normal modes: center-of-mass (all in phase) and axial stretch (∝ positions).
 */

const KE_E2 = 1.0; // dimensionless Coulomb strength
const MASS = 1.0;
const OMEGA_Z = 1.0;

/**
 * Solve 1D equilibrium for N identical ions in a harmonic well.
 * Returns sorted positions centered near 0.
 */
export function equilibriumPositions(n, { omega = OMEGA_Z, iterations = 4000, dt = 0.02 } = {}) {
  if (n < 1) return [];
  // Start with an educated guess: roughly spaced
  let z = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 1.2);

  for (let step = 0; step < iterations; step++) {
    const force = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      force[i] += -MASS * omega * omega * z[i];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dz = z[i] - z[j];
        const sign = dz >= 0 ? 1 : -1;
        const r2 = dz * dz + 1e-12;
        force[i] += sign * KE_E2 / r2; // 1/r^2 repulsion along the axis
      }
    }
    // Damped gradient ascent to force = 0
    const damp = 0.85;
    for (let i = 0; i < n; i++) {
      z[i] += damp * dt * force[i];
    }
  }

  // Recenter
  const mean = z.reduce((a, b) => a + b, 0) / n;
  return z.map((v) => v - mean);
}

/** COM mode eigenvector (normalized): all ions move together. */
export function comMode(n) {
  const a = 1 / Math.sqrt(n);
  return Array.from({ length: n }, () => a);
}

/**
 * Axial stretch mode: displacements proportional to equilibrium positions.
 * Frequency is √3 ω_z independent of N (harmonic trap result).
 */
export function stretchMode(positions) {
  const n = positions.length;
  let norm = 0;
  for (const z of positions) norm += z * z;
  norm = Math.sqrt(norm) || 1;
  return positions.map((z) => z / norm);
}

export function stretchFrequency(omega = OMEGA_Z) {
  return Math.SQRT3 * omega;
}

/**
 * Sample a phonon displacement for animation.
 * mode: 'com' | 'stretch'
 */
export function phononOffset(positions, mode, phase, amplitude = 0.18) {
  const shape = mode === "com" ? comMode(positions.length) : stretchMode(positions);
  const s = Math.sin(phase) * amplitude;
  return positions.map((z, i) => z + shape[i] * s * (positions[positions.length - 1] - positions[0] || 1));
}

export const DEFAULT_ION_COUNT = 5;

/**
 * TrapCraft Paul-trap viewport (three.js).
 * Glowing 171Yb+ ions, electrode rods, Raman beam targeting, phonon animation.
 */

import * as THREE from "three";
import {
  DEFAULT_ION_COUNT,
  equilibriumPositions,
  phononOffset,
} from "./ionPhysics.js";

const YB_COLOR = 0x5ee7ff;
const BEAM_COLOR = 0xff6b3d;
const ROD_COLOR = 0x8a93a3;

export function createTrapViewport(canvas, options = {}) {
  const numIons = options.numIons ?? DEFAULT_ION_COUNT;
  let selected = options.selected ?? [0];
  let phonon = null; // { mode, t0, duration }
  let eq = equilibriumPositions(numIons);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 2.6, 7.2);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x6a7a88, 0.55));
  const key = new THREE.DirectionalLight(0xdde7ff, 1.1);
  key.position.set(3, 6, 4);
  scene.add(key);
  const fill = new THREE.PointLight(0x3ec7c0, 0.7, 20);
  fill.position.set(-2, 1, 3);
  scene.add(fill);

  // Vacuum chamber atmosphere
  const fogTex = makeRadialTexture();
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 10),
    new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, opacity: 0.55 })
  );
  back.position.z = -3;
  scene.add(back);

  // Four RF rod approximations (linear Paul trap silhouette)
  const rods = new THREE.Group();
  const rodGeo = new THREE.CylinderGeometry(0.12, 0.12, 8.5, 20);
  const rodMat = new THREE.MeshStandardMaterial({
    color: ROD_COLOR,
    metalness: 0.85,
    roughness: 0.35,
  });
  const rodOffsets = [
    [-1.7, 1.15],
    [1.7, 1.15],
    [-1.7, -1.15],
    [1.7, -1.15],
  ];
  for (const [x, y] of rodOffsets) {
    const rod = new THREE.Mesh(rodGeo, rodMat);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, y, x * 0.15);
    rods.add(rod);
  }
  scene.add(rods);

  // Axis guide
  const axis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 7.2, 8),
    new THREE.MeshBasicMaterial({ color: 0x2a3a44, transparent: true, opacity: 0.5 })
  );
  axis.rotation.z = Math.PI / 2;
  scene.add(axis);

  const ionGroup = new THREE.Group();
  scene.add(ionGroup);
  const ionMeshes = [];
  const glowMeshes = [];

  function rebuildIons(n) {
    while (ionGroup.children.length) ionGroup.remove(ionGroup.children[0]);
    ionMeshes.length = 0;
    glowMeshes.length = 0;
    eq = equilibriumPositions(n);
    const span = Math.max(Math.abs(eq[0]), Math.abs(eq[eq.length - 1]), 1);
    const scale = 2.6 / span;

    for (let i = 0; i < n; i++) {
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 24, 24),
        new THREE.MeshBasicMaterial({
          color: YB_COLOR,
          transparent: true,
          opacity: 0.18,
        })
      );
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 28, 28),
        new THREE.MeshStandardMaterial({
          color: YB_COLOR,
          emissive: YB_COLOR,
          emissiveIntensity: 0.85,
          metalness: 0.2,
          roughness: 0.25,
        })
      );
      const label = makeLabel(String(i));
      label.position.y = 0.42;
      const wrap = new THREE.Group();
      wrap.add(glow);
      wrap.add(core);
      wrap.add(label);
      wrap.userData.index = i;
      wrap.position.set(eq[i] * scale, 0, 0);
      wrap.userData.baseX = eq[i] * scale;
      ionGroup.add(wrap);
      ionMeshes.push(wrap);
      glowMeshes.push(glow);
    }
    updateSelection();
  }

  function updateSelection() {
    for (const mesh of ionMeshes) {
      const on = selected.includes(mesh.userData.index);
      const core = mesh.children[1];
      core.material.emissiveIntensity = on ? 1.35 : 0.7;
      core.material.color.set(on ? BEAM_COLOR : YB_COLOR);
      core.material.emissive.set(on ? BEAM_COLOR : YB_COLOR);
      mesh.children[0].material.opacity = on ? 0.32 : 0.16;
    }
  }

  // Raman beams
  const beamMat = new THREE.MeshBasicMaterial({
    color: BEAM_COLOR,
    transparent: true,
    opacity: 0.35,
  });
  const beams = new THREE.Group();
  scene.add(beams);

  function redrawBeams() {
    while (beams.children.length) beams.remove(beams.children[0]);
    for (const idx of selected) {
      const ion = ionMeshes[idx];
      if (!ion) continue;
      const geo = new THREE.CylinderGeometry(0.04, 0.04, 3.4, 10);
      const beam = new THREE.Mesh(geo, beamMat);
      beam.position.set(ion.position.x, 1.7, 0.2);
      beams.add(beam);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.35, 16),
        new THREE.MeshBasicMaterial({
          color: BEAM_COLOR,
          transparent: true,
          opacity: 0.55,
        })
      );
      cone.position.set(ion.position.x, 0.35, 0.05);
      cone.rotation.x = Math.PI;
      beams.add(cone);
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function onPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(ionMeshes, true);
    if (!hits.length) return;
    let obj = hits[0].object;
    while (obj && obj.userData.index === undefined) obj = obj.parent;
    if (!obj) return;
    const idx = obj.userData.index;
    if (event.shiftKey) {
      if (selected.includes(idx)) selected = selected.filter((x) => x !== idx);
      else selected = [...selected, idx].sort((a, b) => a - b);
    } else {
      selected = [idx];
    }
    updateSelection();
    redrawBeams();
    options.onSelect?.(selected.slice());
  }

  canvas.addEventListener("pointerdown", onPointer);

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 640;
    const h = canvas.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  let raf = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const t = now * 0.001;
    let xs = eq;
    if (phonon) {
      const elapsed = t - phonon.t0;
      if (elapsed > phonon.duration) {
        phonon = null;
      } else {
        const phase = elapsed * (phonon.mode === "com" ? 7.5 : 13.0);
        const amp = 0.22 * Math.exp(-elapsed * 1.3);
        xs = phononOffset(eq, phonon.mode, phase, amp);
      }
    }
    const span = Math.max(Math.abs(eq[0]), Math.abs(eq[eq.length - 1]), 1);
    const scale = 2.6 / span;
    for (let i = 0; i < ionMeshes.length; i++) {
      ionMeshes[i].position.x = xs[i] * scale;
      ionMeshes[i].position.y = Math.sin(t * 2 + i) * 0.015;
      glowMeshes[i].scale.setScalar(1 + 0.06 * Math.sin(t * 3 + i));
    }
    redrawBeams();
    rods.rotation.y = Math.sin(t * 0.15) * 0.03;
    renderer.render(scene, camera);
  }

  rebuildIons(numIons);
  resize();
  window.addEventListener("resize", resize);
  raf = requestAnimationFrame(tick);

  return {
    setSelected(next) {
      selected = next.slice();
      updateSelection();
      redrawBeams();
    },
    getSelected() {
      return selected.slice();
    },
    pulsePhonon(mode = "stretch", duration = 1.8) {
      phonon = { mode, t0: performance.now() * 0.001, duration };
    },
    setIonCount(n) {
      rebuildIons(n);
      selected = selected.filter((i) => i < n);
      if (!selected.length) selected = [0];
      updateSelection();
      redrawBeams();
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointer);
      renderer.dispose();
    },
    resize,
  };
}

function makeLabel(text) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 128, 64);
  ctx.font = "600 36px 'IBM Plex Sans', sans-serif";
  ctx.fillStyle = "#e8f2f6";
  ctx.textAlign = "center";
  ctx.fillText(text, 64, 42);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.55, 0.28, 1);
  return sprite;
}

function makeRadialTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, "rgba(30, 70, 78, 0.9)");
  g.addColorStop(1, "rgba(6, 12, 18, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

"use client";
// The body, in 3D: a realistic sculpted anatomy figure (shipped as
// public/body.glb, ~880KB) whose surface is carved into the 18 tracked
// muscle regions by triangle position. Each region is its own material
// group, so muscles light independently along a spectrum — red at 0 sets
// through amber to green at 10, then on toward cyan/violet approaching 20.
// Non-muscle surface (head, neck, shins, knees, feet, pelvis) stays a
// translucent ghost gray. Drag (or swipe) to spin; tap a muscle to jump
// to its row.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MuscleKey } from "./muscles";

// Region 0 is the ghost frame; muscles follow in this fixed order.
const REGION_KEYS: MuscleKey[] = [
  "pecs", "front-delts", "side-delts", "rear-delts", "triceps", "lats",
  "traps", "rotator-cuff", "biceps", "forearms", "hands", "abs", "obliques",
  "lower-back", "quads", "hamstrings", "glutes", "calves",
];
const FRAME = 0;
const R: Record<MuscleKey, number> = Object.fromEntries(
  REGION_KEYS.map((k, i) => [k, i + 1])
) as Record<MuscleKey, number>;

// Classify a point on the body surface into a region. Coordinates are
// fractions of total figure height: fy 0 at the feet → 1 at the crown,
// fx lateral from the midline, fz depth (+ is the front of the body).
// Landmark bands were measured from the actual mesh (scripts/analyze-body.mjs).
function classify(fx: number, fy: number, fz: number): number {
  const ax = Math.abs(fx);

  if (fy > 0.845) return FRAME; // head + upper neck

  // Arms hang free of the torso from the hands (~0.42) to the armpit
  // (~0.695); the torso/arm boundary drifts inward as the arm rises.
  if (fy > 0.41 && fy < 0.695) {
    const armBoundary = 0.165 - 0.289 * (fy - 0.45);
    if (ax > armBoundary) {
      if (fy < 0.475) return R["hands"];
      if (fy < 0.575) return R["forearms"];
      return fz > -0.033 ? R["biceps"] : R["triceps"];
    }
  }

  // Deltoid caps — three heads split by depth.
  if (fy >= 0.695 && fy <= 0.815 && ax > 0.095) {
    if (fz > 0.03) return R["front-delts"];
    if (fz < -0.042) return R["rear-delts"];
    return R["side-delts"];
  }

  // Trap ridge between neck and shoulders; the throat stays frame but the
  // clavicle shelf below 0.825 still belongs to the pecs.
  if (fy > 0.79) {
    if (fz < 0.025) return R["traps"];
    return fy > 0.825 ? FRAME : R["pecs"];
  }

  // Upper torso 0.50–0.79.
  if (fy > 0.5) {
    if (fz < -0.015) {
      // back
      if (fy > 0.695) return ax < 0.055 ? R["traps"] : R["rotator-cuff"];
      if (fy > 0.62) return ax < 0.045 ? (fy > 0.66 ? R["traps"] : R["lower-back"]) : R["lats"];
      if (ax < 0.05) return R["lower-back"];
      return ax > 0.09 ? R["obliques"] : R["lats"];
    }
    // front
    if (fy > 0.655) return R["pecs"];
    return ax < 0.05 ? R["abs"] : R["obliques"];
  }

  // Hips 0.415–0.50: glutes behind, top of the quads in front.
  if (fy > 0.415) {
    if (fz < -0.02) return R["glutes"];
    if (fz > 0.01 && ax > 0.04) return R["quads"];
    return FRAME; // pelvis / groin
  }

  // Thighs 0.31–0.415.
  if (fy > 0.31) return fz > -0.012 ? R["quads"] : R["hamstrings"];
  if (fy > 0.26) return FRAME; // knees
  // Lower legs: calf mass bulges backward; the shin front stays frame.
  if (fy > 0.05) return fz < -0.033 ? R["calves"] : FRAME;
  return FRAME; // feet
}

// Progress 0..2 (sets / 10-set floor, 20 = ceiling) → color along a
// spectrum: red → amber → green at 1.0, then green → cyan → violet as the
// muscle pushes past 10 toward 20 sets. Brightness rises the whole way.
function rampColor(p: number, out: THREE.Color) {
  const t = Math.min(Math.max(p, 0), 2);
  const hue = t <= 1 ? 140 * t : 140 + 130 * (t - 1);
  // Dim ember at 0 sets, bright at the 10-set floor, brighter still beyond.
  const light = 0.2 + 0.28 * Math.min(t, 1) + 0.08 * Math.max(t - 1, 0);
  out.setHSL(hue / 360, 0.8, light);
}

export function Body3D({
  sex,
  light,
  progress,
  onPick,
}: {
  sex: "m" | "f";
  light: boolean;
  /** sets / FLOOR per muscle; may exceed 1 (2 = at the 20-set ceiling). */
  progress: Partial<Record<MuscleKey, number>>;
  onPick: (key: MuscleKey) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth;
    const H = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 50);
    camera.position.set(0, 1.85, 6.4);
    camera.lookAt(0, 1.75, 0);

    scene.add(new THREE.AmbientLight(0xffffff, light ? 1.0 : 0.55));
    const key = new THREE.DirectionalLight(0xffffff, light ? 1.3 : 1.0);
    key.position.set(2, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-2.5, 1.5, 1);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x7c5cff, light ? 0.4 : 0.7);
    rim.position.set(-3, 2, -3);
    scene.add(rim);

    const figure = new THREE.Group();
    // ?spin=<radians> presets the rotation (deterministic views for QA).
    const spin = parseFloat(new URLSearchParams(window.location.search).get("spin") ?? "0");
    if (!Number.isNaN(spin)) figure.rotation.y = spin;
    scene.add(figure);

    const frameMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(light ? 0xb9b9cc : 0x3a3a52),
      transparent: true,
      opacity: light ? 0.6 : 0.5,
      roughness: 0.7,
      metalness: 0.1,
      depthWrite: false,
    });
    const muscleMats = REGION_KEYS.map(
      () =>
        new THREE.MeshStandardMaterial({
          color: 0x333344,
          emissive: 0x000000,
          emissiveIntensity: 0.3,
          roughness: 0.42,
          metalness: 0.15,
        })
    );
    const materials = [frameMat, ...muscleMats];

    let bodyMesh: THREE.Mesh | null = null;
    let faceRegion: Uint8Array | null = null;
    let disposed = false;

    new GLTFLoader().load("/body.glb", (gltf) => {
      if (disposed) return;
      gltf.scene.updateMatrixWorld(true);

      // Bake every primitive into one non-indexed position+normal soup in
      // world space.
      const chunks: THREE.BufferGeometry[] = [];
      gltf.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          const g = m.geometry.clone().toNonIndexed();
          g.applyMatrix4(m.matrixWorld);
          chunks.push(g);
        }
      });
      let vertCount = 0;
      for (const c of chunks) vertCount += c.attributes.position.count;
      const pos = new Float32Array(vertCount * 3);
      let off = 0;
      for (const c of chunks) {
        pos.set(c.attributes.position.array as Float32Array, off);
        off += c.attributes.position.array.length;
        c.dispose();
      }

      // Normalize: feet at 0, height → fractions for classification.
      const box = new THREE.Box3().setFromArray(pos);
      const height = box.max.y - box.min.y;
      const cx = (box.min.x + box.max.x) / 2;

      const faceCount = vertCount / 3;
      let regionOf = new Uint8Array(faceCount);
      for (let f = 0; f < faceCount; f++) {
        const i = f * 9;
        const fx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3 - cx;
        const fy = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3 - box.min.y;
        const fz = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3;
        regionOf[f] = classify(fx / height, fy / height, fz / height);
      }

      // Majority-vote smoothing over shared-vertex neighbors: erodes the
      // ragged single-triangle fringes the plane-cut classifier leaves at
      // region borders.
      const vertFaces = new Map<string, number[]>();
      const q = 1e4 / height;
      for (let f = 0; f < faceCount; f++) {
        for (let v = 0; v < 3; v++) {
          const i = f * 9 + v * 3;
          const k = `${Math.round(pos[i] * q)},${Math.round(pos[i + 1] * q)},${Math.round(pos[i + 2] * q)}`;
          let list = vertFaces.get(k);
          if (!list) vertFaces.set(k, (list = []));
          list.push(f);
        }
      }
      const faceKeys: string[][] = [];
      for (let f = 0; f < faceCount; f++) {
        const keys: string[] = [];
        for (let v = 0; v < 3; v++) {
          const i = f * 9 + v * 3;
          keys.push(`${Math.round(pos[i] * q)},${Math.round(pos[i + 1] * q)},${Math.round(pos[i + 2] * q)}`);
        }
        faceKeys.push(keys);
      }
      for (let pass = 0; pass < 2; pass++) {
        const next = new Uint8Array(regionOf);
        const votes = new Map<number, number>();
        for (let f = 0; f < faceCount; f++) {
          votes.clear();
          for (const k of faceKeys[f])
            for (const nb of vertFaces.get(k)!)
              votes.set(regionOf[nb], (votes.get(regionOf[nb]) ?? 0) + 1);
          let best = regionOf[f];
          let bestN = (votes.get(best) ?? 0) + 1; // self keeps a small edge
          for (const [r, n] of votes)
            if (n > bestN) { best = r; bestN = n; }
          next[f] = best;
        }
        regionOf = next;
      }

      // Sort faces by region so each region is one contiguous draw group.
      const order = Array.from({ length: faceCount }, (_, i) => i).sort(
        (a, b) => regionOf[a] - regionOf[b]
      );
      const sortedPos = new Float32Array(vertCount * 3);
      faceRegion = new Uint8Array(faceCount);
      for (let n = 0; n < faceCount; n++) {
        const src = order[n] * 9;
        for (let k = 0; k < 9; k++) sortedPos[n * 9 + k] = pos[src + k];
        faceRegion[n] = regionOf[order[n]];
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(sortedPos, 3));
      geo.computeVertexNormals();
      let start = 0;
      for (let r = 0; r < materials.length; r++) {
        let count = 0;
        while (start + count < faceCount && faceRegion[start + count] === r) count++;
        if (count > 0) geo.addGroup(start * 3, count * 3, r);
        start += count;
      }

      bodyMesh = new THREE.Mesh(geo, materials);
      const s = 3.7 / height;
      bodyMesh.scale.set(s * (sex === "f" ? 0.96 : 1), s, s);
      bodyMesh.position.set(-cx * s, -box.min.y * s, 0);
      figure.add(bodyMesh);
    });

    // Spin: pointer drag rotates the figure around its center (y axis),
    // with a touch of inertia. Vertical scrolling still works on mobile
    // because we only claim horizontal moves.
    let dragging = false;
    let lastX = 0;
    let velocity = 0;
    let moved = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      figure.rotation.y += dx * 0.011;
      velocity = dx * 0.011;
    };
    const raycaster = new THREE.Raycaster();
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (moved < 6 && bodyMesh && faceRegion) {
        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObject(bodyMesh)[0];
        if (hit && hit.faceIndex != null) {
          const region = faceRegion[hit.faceIndex];
          if (region > 0) pickRef.current(REGION_KEYS[region - 1]);
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.style.touchAction = "pan-y";
    renderer.domElement.style.cursor = "grab";

    const target = new THREE.Color();
    let raf = 0;
    const tick = () => {
      for (let i = 0; i < REGION_KEYS.length; i++) {
        const p = progressRef.current[REGION_KEYS[i]] ?? 0;
        const mat = muscleMats[i];
        rampColor(p, target);
        mat.color.lerp(target, 0.12);
        mat.emissive.lerp(target, 0.12);
        const glow = 0.08 + 0.7 * Math.min(p, 1) + 0.3 * Math.max(Math.min(p, 2) - 1, 0);
        mat.emissiveIntensity += (glow - mat.emissiveIntensity) * 0.12;
      }
      if (!dragging && Math.abs(velocity) > 0.0001) {
        figure.rotation.y += velocity;
        velocity *= 0.95;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      bodyMesh?.geometry.dispose();
      for (const m of materials) m.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [sex, light]);

  return <div ref={mountRef} className="h-[62vh] min-h-[380px] w-full" aria-label="3D body — drag to spin" />;
}

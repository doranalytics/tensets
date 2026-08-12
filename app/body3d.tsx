"use client";
// The body, in 3D: a translucent anatomical figure — a ghost frame with
// every muscle as its own mesh, lit dim → bright by the week's sets (full
// glow at 10). Drag (or swipe) to spin it around its center axis; tap a
// muscle to jump to its row. Fully procedural: no model files, ships in
// the bundle, works offline. Long muscles are capsules aligned to the
// limbs and sheet muscles are flattened wraps, so the figure reads as
// anatomy rather than bubbles.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { MuscleKey } from "./muscles";

type Vec3 = [number, number, number];
interface MusclePart {
  key: MuscleKey;
  pos: Vec3;
  scale: Vec3;
  geo: "sphere" | "capsule";
  rotX?: number;
  rotZ?: number;
  mirror?: boolean;
}

// One side is authored; `mirror` builds the other. Units are meters-ish on
// a ~3.7-tall figure standing at the origin. Muscles hug the frame: small
// offsets, flattened depth, limb muscles elongated along the limb axis.
const PARTS: MusclePart[] = [
  // -- chest / shoulders --
  { key: "pecs", pos: [0.2, 2.6, 0.17], scale: [0.24, 0.15, 0.09], geo: "sphere", rotZ: -0.15, mirror: true },
  { key: "front-delts", pos: [0.44, 2.72, 0.1], scale: [0.1, 0.12, 0.09], geo: "sphere", mirror: true },
  { key: "side-delts", pos: [0.52, 2.73, 0], scale: [0.11, 0.14, 0.11], geo: "sphere", mirror: true },
  { key: "rear-delts", pos: [0.44, 2.7, -0.11], scale: [0.1, 0.11, 0.08], geo: "sphere", mirror: true },
  // -- arms: long capsules along the hanging arm, slight outward lean --
  { key: "biceps", pos: [0.57, 2.32, 0.06], scale: [0.085, 0.16, 0.085], geo: "capsule", rotZ: 0.08, mirror: true },
  { key: "triceps", pos: [0.6, 2.3, -0.07], scale: [0.09, 0.17, 0.09], geo: "capsule", rotZ: 0.08, mirror: true },
  { key: "forearms", pos: [0.66, 1.83, 0], scale: [0.075, 0.19, 0.075], geo: "capsule", rotZ: 0.05, mirror: true },
  { key: "hands", pos: [0.71, 1.46, 0.02], scale: [0.07, 0.11, 0.05], geo: "sphere", mirror: true },
  // -- back: flattened sheets wrapping the trunk --
  { key: "traps", pos: [0.14, 2.84, -0.1], scale: [0.2, 0.13, 0.07], geo: "sphere", rotZ: 0.35, mirror: true },
  { key: "rotator-cuff", pos: [0.3, 2.6, -0.18], scale: [0.11, 0.12, 0.06], geo: "sphere", mirror: true },
  { key: "lats", pos: [0.26, 2.26, -0.15], scale: [0.16, 0.3, 0.08], geo: "sphere", rotZ: 0.12, mirror: true },
  { key: "lower-back", pos: [0, 2.0, -0.18], scale: [0.18, 0.2, 0.07], geo: "sphere" },
  // -- front core --
  { key: "abs", pos: [0, 2.12, 0.19], scale: [0.16, 0.24, 0.07], geo: "capsule" },
  { key: "obliques", pos: [0.22, 2.1, 0.06], scale: [0.08, 0.22, 0.13], geo: "capsule", mirror: true },
  // -- hips / legs: long tapered capsules on the thigh and calf lines --
  { key: "glutes", pos: [0.18, 1.54, -0.16], scale: [0.17, 0.16, 0.13], geo: "sphere", mirror: true },
  { key: "quads", pos: [0.22, 1.02, 0.07], scale: [0.13, 0.3, 0.11], geo: "capsule", rotZ: 0.03, mirror: true },
  { key: "hamstrings", pos: [0.22, 1.0, -0.09], scale: [0.11, 0.28, 0.1], geo: "capsule", rotZ: 0.03, mirror: true },
  { key: "calves", pos: [0.2, 0.44, -0.06], scale: [0.095, 0.19, 0.095], geo: "capsule", mirror: true },
];

// The ghost frame underneath: head, trunk, limbs, joints.
const BONES: { pos: Vec3; scale: Vec3; kind: "sphere" | "capsule"; rotZ?: number }[] = [
  { pos: [0, 3.32, 0], scale: [0.26, 0.31, 0.28], kind: "sphere" }, // head — faceless
  { pos: [0, 3.0, 0], scale: [0.1, 0.16, 0.1], kind: "capsule" }, // neck
  { pos: [0, 2.48, 0], scale: [0.38, 0.5, 0.21], kind: "capsule" }, // chest
  { pos: [0, 1.95, 0], scale: [0.29, 0.34, 0.19], kind: "capsule" }, // waist
  { pos: [0, 1.6, 0], scale: [0.33, 0.22, 0.2], kind: "sphere" }, // pelvis
  { pos: [0.5, 2.73, 0], scale: [0.11, 0.1, 0.11], kind: "sphere" }, // shoulder cap L
  { pos: [-0.5, 2.73, 0], scale: [0.11, 0.1, 0.11], kind: "sphere" },
  { pos: [0.58, 2.31, 0], scale: [0.08, 0.28, 0.08], kind: "capsule", rotZ: 0.08 }, // upper arm L
  { pos: [-0.58, 2.31, 0], scale: [0.08, 0.28, 0.08], kind: "capsule", rotZ: -0.08 },
  { pos: [0.63, 1.98, 0], scale: [0.07, 0.06, 0.07], kind: "sphere" }, // elbow L
  { pos: [-0.63, 1.98, 0], scale: [0.07, 0.06, 0.07], kind: "sphere" },
  { pos: [0.66, 1.82, 0], scale: [0.065, 0.26, 0.065], kind: "capsule", rotZ: 0.05 }, // lower arm L
  { pos: [-0.66, 1.82, 0], scale: [0.065, 0.26, 0.065], kind: "capsule", rotZ: -0.05 },
  { pos: [0.22, 1.02, 0], scale: [0.12, 0.46, 0.12], kind: "capsule" }, // thigh L
  { pos: [-0.22, 1.02, 0], scale: [0.12, 0.46, 0.12], kind: "capsule" },
  { pos: [0.21, 0.68, 0], scale: [0.085, 0.07, 0.085], kind: "sphere" }, // knee L
  { pos: [-0.21, 0.68, 0], scale: [0.085, 0.07, 0.085], kind: "sphere" },
  { pos: [0.2, 0.36, 0], scale: [0.08, 0.34, 0.08], kind: "capsule" }, // shin L
  { pos: [-0.2, 0.36, 0], scale: [0.08, 0.34, 0.08], kind: "capsule" },
  { pos: [0.2, -0.05, 0.08], scale: [0.085, 0.055, 0.16], kind: "sphere" }, // foot L
  { pos: [-0.2, -0.05, 0.08], scale: [0.085, 0.055, 0.16], kind: "sphere" },
];

export function Body3D({
  sex,
  light,
  progress,
  onPick,
}: {
  sex: "m" | "f";
  light: boolean;
  /** 0..1 per muscle (sets / FLOOR, capped). */
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

    scene.add(new THREE.AmbientLight(0xffffff, light ? 1.1 : 0.7));
    const key = new THREE.DirectionalLight(0xffffff, light ? 1.2 : 0.9);
    key.position.set(2, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7c5cff, 0.6);
    rim.position.set(-3, 2, -3);
    scene.add(rim);

    const figure = new THREE.Group();
    scene.add(figure);

    const accent = new THREE.Color(0x7c5cff);
    const good = new THREE.Color(0x34d399);
    const boneColor = new THREE.Color(light ? 0xc9c9dd : 0x2a2a3d);

    const sphereGeo = new THREE.SphereGeometry(1, 24, 18);
    const capsuleGeo = new THREE.CapsuleGeometry(1, 1.15, 6, 14);

    const boneMat = new THREE.MeshStandardMaterial({
      color: boneColor,
      transparent: true,
      opacity: light ? 0.55 : 0.48,
      roughness: 0.75,
      metalness: 0.1,
      depthWrite: false,
    });
    const shoulderScale = sex === "f" ? 0.92 : 1;
    const hipScale = sex === "f" ? 1.08 : 1;
    const widthFor = (y: number) => (y > 1.7 ? shoulderScale : hipScale);
    for (const b of BONES) {
      const mesh = new THREE.Mesh(b.kind === "sphere" ? sphereGeo : capsuleGeo, boneMat);
      mesh.position.set(b.pos[0] * widthFor(b.pos[1]), b.pos[1], b.pos[2]);
      mesh.scale.set(b.scale[0], b.scale[1], b.scale[2]);
      if (b.rotZ) mesh.rotation.z = b.rotZ;
      figure.add(mesh);
    }

    const muscleMeshes: { key: MuscleKey; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];
    const addMuscle = (p: MusclePart, mirrored: boolean) => {
      const mat = new THREE.MeshStandardMaterial({
        color: accent.clone(),
        emissive: accent.clone(),
        emissiveIntensity: 0.05,
        transparent: true,
        opacity: 0.5,
        roughness: 0.45,
        metalness: 0.12,
      });
      const mesh = new THREE.Mesh(p.geo === "capsule" ? capsuleGeo : sphereGeo, mat);
      const x = (mirrored ? -p.pos[0] : p.pos[0]) * widthFor(p.pos[1]);
      mesh.position.set(x, p.pos[1], p.pos[2]);
      mesh.scale.set(p.scale[0], p.scale[1], p.scale[2]);
      if (p.rotZ) mesh.rotation.z = mirrored ? -p.rotZ : p.rotZ;
      if (p.rotX) mesh.rotation.x = p.rotX;
      mesh.userData.muscle = p.key;
      figure.add(mesh);
      muscleMeshes.push({ key: p.key, mesh, mat });
    };
    for (const p of PARTS) {
      addMuscle(p, false);
      if (p.mirror) addMuscle(p, true);
    }

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
      if (moved < 6) {
        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(muscleMeshes.map((m) => m.mesh));
        const first = hits[0]?.object as THREE.Mesh | undefined;
        if (first?.userData.muscle) pickRef.current(first.userData.muscle as MuscleKey);
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.style.touchAction = "pan-y";
    renderer.domElement.style.cursor = "grab";

    let raf = 0;
    const tick = () => {
      for (const m of muscleMeshes) {
        const p = Math.min(progressRef.current[m.key] ?? 0, 1);
        const lit = p >= 1;
        const target = lit ? good : accent;
        m.mat.color.lerp(target, 0.15);
        m.mat.emissive.lerp(target, 0.15);
        m.mat.emissiveIntensity += (0.05 + p * (lit ? 0.9 : 0.5) - m.mat.emissiveIntensity) * 0.15;
        m.mat.opacity += (0.42 + p * 0.45 - m.mat.opacity) * 0.15;
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
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.dispose();
      sphereGeo.dispose();
      capsuleGeo.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [sex, light]);

  return <div ref={mountRef} className="h-[62vh] min-h-[380px] w-full" aria-label="3D body — drag to spin" />;
}

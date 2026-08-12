"use client";
// The body, in 3D: a translucent anatomical figure built from primitives —
// a ghost skeleton with every muscle as its own mesh, lit dim → bright by
// the week's sets (full glow at 10). Drag (or swipe) to spin it around its
// center axis; tap a muscle to jump to its row. No model files, no loader:
// the whole figure is procedural, so it ships in the bundle and works
// offline.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { MuscleKey } from "./muscles";

type Vec3 = [number, number, number];
interface MusclePart {
  key: MuscleKey;
  pos: Vec3;
  scale: Vec3;
  rotZ?: number;
  rotX?: number;
  mirror?: boolean;
}

// One side is authored; `mirror` builds the other. Units are meters-ish on
// a ~3.7-tall figure standing at the origin.
const PARTS: MusclePart[] = [
  { key: "pecs", pos: [0.2, 2.62, 0.2], scale: [0.26, 0.17, 0.13], mirror: true },
  { key: "front-delts", pos: [0.46, 2.74, 0.14], scale: [0.13, 0.13, 0.12], mirror: true },
  { key: "side-delts", pos: [0.56, 2.74, 0], scale: [0.13, 0.15, 0.14], mirror: true },
  { key: "rear-delts", pos: [0.46, 2.72, -0.15], scale: [0.13, 0.12, 0.11], mirror: true },
  { key: "biceps", pos: [0.6, 2.32, 0.08], scale: [0.1, 0.24, 0.1], mirror: true },
  { key: "triceps", pos: [0.63, 2.3, -0.09], scale: [0.1, 0.26, 0.1], mirror: true },
  { key: "forearms", pos: [0.68, 1.82, 0], scale: [0.09, 0.28, 0.09], mirror: true },
  { key: "hands", pos: [0.72, 1.45, 0.02], scale: [0.09, 0.13, 0.07], mirror: true },
  { key: "traps", pos: [0.16, 2.88, -0.08], scale: [0.22, 0.14, 0.14], mirror: true },
  { key: "rotator-cuff", pos: [0.32, 2.62, -0.2], scale: [0.12, 0.13, 0.09], mirror: true },
  { key: "lats", pos: [0.28, 2.28, -0.16], scale: [0.19, 0.32, 0.12], mirror: true },
  { key: "lower-back", pos: [0, 2.0, -0.2], scale: [0.2, 0.22, 0.1] },
  { key: "abs", pos: [0, 2.14, 0.24], scale: [0.19, 0.32, 0.1] },
  { key: "obliques", pos: [0.24, 2.12, 0.1], scale: [0.1, 0.28, 0.16], mirror: true },
  { key: "glutes", pos: [0.19, 1.52, -0.19], scale: [0.19, 0.19, 0.16], mirror: true },
  { key: "quads", pos: [0.22, 1.0, 0.08], scale: [0.15, 0.42, 0.14], mirror: true },
  { key: "hamstrings", pos: [0.22, 1.0, -0.11], scale: [0.13, 0.4, 0.12], mirror: true },
  { key: "calves", pos: [0.2, 0.42, -0.07], scale: [0.11, 0.28, 0.11], mirror: true },
];

// The ghost skeleton underneath: head, trunk, limbs. Capsules + spheres.
const BONES: { pos: Vec3; scale: Vec3; kind: "sphere" | "capsule"; rotZ?: number }[] = [
  { pos: [0, 3.32, 0], scale: [0.27, 0.32, 0.29], kind: "sphere" }, // head — faceless
  { pos: [0, 3.0, 0], scale: [0.11, 0.18, 0.11], kind: "capsule" }, // neck
  { pos: [0, 2.45, 0], scale: [0.4, 0.55, 0.24], kind: "capsule" }, // chest
  { pos: [0, 1.85, 0], scale: [0.32, 0.4, 0.22], kind: "capsule" }, // waist/pelvis
  { pos: [0.6, 2.32, 0], scale: [0.085, 0.3, 0.085], kind: "capsule" }, // upper arm L
  { pos: [-0.6, 2.32, 0], scale: [0.085, 0.3, 0.085], kind: "capsule" },
  { pos: [0.68, 1.82, 0], scale: [0.07, 0.28, 0.07], kind: "capsule" }, // lower arm L
  { pos: [-0.68, 1.82, 0], scale: [0.07, 0.28, 0.07], kind: "capsule" },
  { pos: [0.22, 1.0, 0], scale: [0.13, 0.5, 0.13], kind: "capsule" }, // thigh L
  { pos: [-0.22, 1.0, 0], scale: [0.13, 0.5, 0.13], kind: "capsule" },
  { pos: [0.2, 0.35, 0], scale: [0.09, 0.38, 0.09], kind: "capsule" }, // shin L
  { pos: [-0.2, 0.35, 0], scale: [0.09, 0.38, 0.09], kind: "capsule" },
  { pos: [0.2, -0.06, 0.08], scale: [0.09, 0.06, 0.17], kind: "sphere" }, // foot L
  { pos: [-0.2, -0.06, 0.08], scale: [0.09, 0.06, 0.17], kind: "sphere" },
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
    // Center the spin on the figure's own axis.
    figure.position.set(0, 0, 0);
    scene.add(figure);

    const accent = new THREE.Color(0x7c5cff);
    const good = new THREE.Color(0x34d399);
    const boneColor = new THREE.Color(light ? 0xc9c9dd : 0x2a2a3d);

    const sphereGeo = new THREE.SphereGeometry(1, 24, 18);
    const capsuleGeo = new THREE.CapsuleGeometry(1, 1.15, 6, 14);

    // Ghost skeleton
    const boneMat = new THREE.MeshStandardMaterial({
      color: boneColor,
      transparent: true,
      opacity: light ? 0.5 : 0.42,
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
      figure.add(mesh);
    }

    // Muscles
    const muscleMeshes: { key: MuscleKey; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];
    const addMuscle = (p: MusclePart, mirrored: boolean) => {
      const mat = new THREE.MeshStandardMaterial({
        color: accent.clone(),
        emissive: accent.clone(),
        emissiveIntensity: 0.05,
        transparent: true,
        opacity: 0.45,
        roughness: 0.4,
        metalness: 0.15,
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
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
        // a tap, not a drag — pick a muscle
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
      // glow follows the live progress
      for (const m of muscleMeshes) {
        const p = Math.min(progressRef.current[m.key] ?? 0, 1);
        const lit = p >= 1;
        const target = lit ? good : accent;
        m.mat.color.lerp(target, 0.15);
        m.mat.emissive.lerp(target, 0.15);
        m.mat.emissiveIntensity += (0.05 + p * (lit ? 0.9 : 0.5) - m.mat.emissiveIntensity) * 0.15;
        m.mat.opacity += (0.35 + p * 0.5 - m.mat.opacity) * 0.15;
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
    // Rebuild the scene when the figure or theme changes.
  }, [sex, light]);

  return <div ref={mountRef} className="h-[62vh] min-h-[380px] w-full" aria-label="3D body — drag to spin" />;
}

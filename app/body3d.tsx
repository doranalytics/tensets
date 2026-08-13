"use client";
// The body, in 3D: a realistic sculpted anatomy figure (shipped as
// public/body.glb, ~880KB) whose surface is carved into the 18 tracked
// muscle regions. Regions are assigned per welded vertex and smoothed, so
// boundaries blend instead of cutting hard edges; a per-vertex cavity
// term keeps the sculpt's grooves dark while muscle bellies carry the
// color, so the glow follows actual muscle shapes rather than reading as
// paint. Colors run a spectrum by weekly sets — red at 0 through amber to
// green at 10, then cyan toward violet approaching 20. Non-muscle surface
// (head, neck, shins, knees, feet, pelvis) stays a translucent ghost
// gray. Drag (or swipe) to spin; tap a muscle to jump to its row.
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
const NREGIONS = REGION_KEYS.length + 1;
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

  // Deltoid caps — three heads split by depth into true front/side/rear
  // thirds of the shoulder ball (its z spread is roughly -0.07..0.06).
  if (fy >= 0.69 && fy <= 0.815 && ax > 0.09) {
    if (fz > -0.005) return R["front-delts"];
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
  const light = 0.2 + 0.28 * Math.min(t, 1) + 0.08 * Math.max(t - 1, 0);
  out.setHSL(hue / 360, 0.75, light);
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

    scene.add(new THREE.AmbientLight(0xffffff, light ? 1.0 : 0.5));
    const key = new THREE.DirectionalLight(0xffffff, light ? 1.3 : 1.0);
    key.position.set(2, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
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

    // Live per-region color/glow uniforms, lerped every frame.
    const regionColors = Array.from({ length: NREGIONS }, () => new THREE.Color(0x22222e));
    const regionGlow = new Float32Array(NREGIONS);
    const frameColor = new THREE.Color(light ? 0xb9b9cc : 0x343448);
    regionColors[FRAME].copy(frameColor);

    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      transparent: true,
      opacity: light ? 0.6 : 0.5,
      roughness: 0.7,
      metalness: 0.1,
      depthWrite: false,
    });
    const muscleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.12,
    });
    muscleMat.onBeforeCompile = (shader) => {
      shader.uniforms.uColors = { value: regionColors };
      shader.uniforms.uGlow = { value: regionGlow };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           attribute float aRegion;
           attribute float aCavity;
           uniform vec3 uColors[${NREGIONS}];
           uniform float uGlow[${NREGIONS}];
           varying vec3 vRegionColor;
           varying vec3 vRegionEmissive;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           int rgn = int(aRegion + 0.5);
           vec3 rc = uColors[rgn];
           float rg = uGlow[rgn];
           // Grooves between muscles stay dark; bellies carry the color.
           vRegionColor = rc * mix(0.25, 1.15, aCavity);
           vRegionEmissive = rc * rg * mix(0.1, 1.0, pow(aCavity, 1.6));`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec3 vRegionColor;
           varying vec3 vRegionEmissive;`
        )
        .replace(
          "vec4 diffuseColor = vec4( diffuse, opacity );",
          "vec4 diffuseColor = vec4( vRegionColor, opacity );"
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           totalEmissiveRadiance += vRegionEmissive;`
        );
    };

    let bodyMesh: THREE.Mesh | null = null;
    let faceRegion: Uint8Array | null = null;
    let disposed = false;

    new GLTFLoader().load("/body.glb", (gltf) => {
      if (disposed) return;
      gltf.scene.updateMatrixWorld(true);

      // Bake every primitive into one non-indexed position soup in world
      // space, then weld duplicate positions into an indexed mesh.
      const chunks: THREE.BufferGeometry[] = [];
      gltf.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          const g = m.geometry.clone().toNonIndexed();
          g.applyMatrix4(m.matrixWorld);
          chunks.push(g);
        }
      });
      let soupCount = 0;
      for (const c of chunks) soupCount += c.attributes.position.count;
      const soup = new Float32Array(soupCount * 3);
      let off = 0;
      for (const c of chunks) {
        soup.set(c.attributes.position.array as Float32Array, off);
        off += c.attributes.position.array.length;
        c.dispose();
      }

      const box = new THREE.Box3().setFromArray(soup);
      const height = box.max.y - box.min.y;
      const cx = (box.min.x + box.max.x) / 2;

      // Weld by quantized position.
      const q = 1e4 / height;
      const weldIndex = new Map<string, number>();
      const soupToWeld = new Uint32Array(soupCount);
      const weldPos: number[] = [];
      for (let i = 0; i < soupCount; i++) {
        const x = soup[i * 3], y = soup[i * 3 + 1], z = soup[i * 3 + 2];
        const k = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
        let w = weldIndex.get(k);
        if (w === undefined) {
          w = weldPos.length / 3;
          weldIndex.set(k, w);
          weldPos.push(x, y, z);
        }
        soupToWeld[i] = w;
      }
      const weldCount = weldPos.length / 3;
      const faceCount = soupCount / 3;
      const index = new Uint32Array(soupCount);
      for (let i = 0; i < soupCount; i++) index[i] = soupToWeld[i];

      // Neighbor graph over welded vertices.
      const neighbors: Set<number>[] = Array.from({ length: weldCount }, () => new Set());
      for (let f = 0; f < faceCount; f++) {
        const a = index[f * 3], b = index[f * 3 + 1], c = index[f * 3 + 2];
        neighbors[a].add(b).add(c);
        neighbors[b].add(a).add(c);
        neighbors[c].add(a).add(b);
      }

      // Region per welded vertex, then majority-smooth so borders follow
      // the surface instead of the classifier's cutting planes.
      let region = new Uint8Array(weldCount);
      for (let w = 0; w < weldCount; w++) {
        region[w] = classify(
          (weldPos[w * 3] - cx) / height,
          (weldPos[w * 3 + 1] - box.min.y) / height,
          weldPos[w * 3 + 2] / height
        );
      }
      const votes = new Float32Array(NREGIONS);
      for (let pass = 0; pass < 3; pass++) {
        const next = new Uint8Array(region);
        for (let w = 0; w < weldCount; w++) {
          votes.fill(0);
          votes[region[w]] += 2;
          for (const nb of neighbors[w]) votes[region[nb]] += 1;
          let best = region[w];
          for (let r = 0; r < NREGIONS; r++) if (votes[r] > votes[best]) best = r;
          next[w] = best;
        }
        region = next;
      }

      // Smooth normals for the welded mesh (needed for cavity).
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(weldPos, 3));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      geo.computeVertexNormals();
      const nrm = geo.attributes.normal.array as Float32Array;

      // Cavity: how far a vertex sits above (belly) or below (groove) the
      // local neighborhood, measured along its normal and normalized by
      // edge length. Smoothed twice, then squashed to 0..1.
      const raw = new Float32Array(weldCount);
      for (let w = 0; w < weldCount; w++) {
        let mx = 0, my = 0, mz = 0, edge = 0, n = 0;
        const px = weldPos[w * 3], py = weldPos[w * 3 + 1], pz = weldPos[w * 3 + 2];
        for (const nb of neighbors[w]) {
          const bx = weldPos[nb * 3], by = weldPos[nb * 3 + 1], bz = weldPos[nb * 3 + 2];
          mx += bx; my += by; mz += bz;
          edge += Math.hypot(bx - px, by - py, bz - pz);
          n++;
        }
        if (!n) continue;
        mx /= n; my /= n; mz /= n; edge /= n;
        const d =
          ((px - mx) * nrm[w * 3] + (py - my) * nrm[w * 3 + 1] + (pz - mz) * nrm[w * 3 + 2]) /
          (edge || 1);
        raw[w] = d;
      }
      for (let pass = 0; pass < 2; pass++) {
        const sm = new Float32Array(weldCount);
        for (let w = 0; w < weldCount; w++) {
          let s = raw[w], n = 1;
          for (const nb of neighbors[w]) { s += raw[nb]; n++; }
          sm[w] = s / n;
        }
        raw.set(sm);
      }
      const cavity = new Float32Array(weldCount);
      for (let w = 0; w < weldCount; w++) {
        // raw ~ [-0.3, 0.3]; ridges positive. Sigmoid-ish squash.
        cavity[w] = Math.min(1, Math.max(0, 0.55 + raw[w] * 3.5));
      }

      geo.setAttribute("aRegion", new THREE.Float32BufferAttribute(Float32Array.from(region), 1));
      geo.setAttribute("aCavity", new THREE.BufferAttribute(cavity, 1));

      // Two draw groups: frame faces (translucent gray) first, then all
      // muscle faces under the region-shaded material. A face is frame
      // only when all three corners are frame, so borders fade via vertex
      // interpolation instead of cutting.
      const isFrameFace = (f: number) =>
        region[index[f * 3]] === FRAME && region[index[f * 3 + 1]] === FRAME && region[index[f * 3 + 2]] === FRAME;
      const frameFaces: number[] = [];
      const muscleFaces: number[] = [];
      for (let f = 0; f < faceCount; f++) (isFrameFace(f) ? frameFaces : muscleFaces).push(f);
      const sortedIndex = new Uint32Array(soupCount);
      faceRegion = new Uint8Array(faceCount);
      let fi = 0;
      for (const f of [...frameFaces, ...muscleFaces]) {
        sortedIndex[fi * 3] = index[f * 3];
        sortedIndex[fi * 3 + 1] = index[f * 3 + 1];
        sortedIndex[fi * 3 + 2] = index[f * 3 + 2];
        // Pick target: the most-common non-frame region among corners.
        const rs = [region[index[f * 3]], region[index[f * 3 + 1]], region[index[f * 3 + 2]]];
        faceRegion[fi] = rs.find((r) => r !== FRAME && rs.filter((x) => x === r).length >= 2) ?? rs.find((r) => r !== FRAME) ?? FRAME;
        fi++;
      }
      geo.setIndex(new THREE.BufferAttribute(sortedIndex, 1));
      geo.clearGroups();
      geo.addGroup(0, frameFaces.length * 3, 0);
      geo.addGroup(frameFaces.length * 3, muscleFaces.length * 3, 1);

      bodyMesh = new THREE.Mesh(geo, [frameMat, muscleMat]);
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
        rampColor(p, target);
        regionColors[i + 1].lerp(target, 0.12);
        const glow = 0.08 + 0.7 * Math.min(p, 1) + 0.3 * Math.max(Math.min(p, 2) - 1, 0);
        regionGlow[i + 1] += (glow - regionGlow[i + 1]) * 0.12;
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
      frameMat.dispose();
      muscleMat.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [sex, light]);

  return <div ref={mountRef} className="h-[62vh] min-h-[380px] w-full" aria-label="3D body — drag to spin" />;
}

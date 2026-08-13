"use client";
// The body, in 3D: a realistic sculpted anatomy figure (shipped as
// public/body.glb, ~880KB) whose surface is carved into the 18 tracked
// muscle regions by the pipeline in segment.mjs — landmark bands seed the
// labels, then a watershed pass settles every border into the sculpt's
// actual grooves, and a soft band of bare skin separates adjacent
// muscles so each reads as its own shape. Muscles also swell slightly
// with logged sets (normal-direction displacement, belly-masked). A
// per-vertex cavity term keeps the sculpt's grooves dark while bellies
// carry the
// color, so the glow follows actual muscle shapes rather than reading as
// paint. Color encodes weekly sets as heat on a single perceptual ramp —
// dim violet ember at 0, through wine and ember red, molten gold at 10,
// white-hot approaching 20 — so brighter always means more. Non-muscle
// surface (head, neck, shins, knees, feet, pelvis) stays a translucent
// ghost gray. Drag (or swipe) to spin; tap a muscle to jump to its row.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MuscleKey } from "./muscles";
import { FRAME, NREGIONS, REGION_KEYS, segmentBody } from "./segment.mjs";

// Progress 0..2 (sets / 10-set floor, 20 = ceiling) → heat. An
// inferno-family sequential ramp: dim violet ember at 0, through wine and
// ember red, molten gold exactly at 1.0 (the floor), bleaching toward
// white-hot at 2.0 (the ceiling). OKLCH lightness rises strictly
// monotonically across the stops, so "more sets = brighter" reads at a
// glance — and survives colorblindness — while the hue drift just
// reinforces the heat metaphor. Stops lerp in linear-light space.
const RAMP: { t: number; c: THREE.Color }[] = [
  { t: 0.0, c: new THREE.Color("#332044") },
  { t: 0.35, c: new THREE.Color("#6d2a4e") },
  { t: 0.7, c: new THREE.Color("#b23a3f") },
  { t: 1.0, c: new THREE.Color("#ef8f1f") },
  { t: 1.45, c: new THREE.Color("#f8c435") },
  { t: 2.0, c: new THREE.Color("#ffe9a0") },
];
function rampColor(p: number, out: THREE.Color) {
  const t = Math.min(Math.max(p, 0), 2);
  let i = 1;
  while (i < RAMP.length - 1 && RAMP[i].t < t) i++;
  const a = RAMP[i - 1];
  const b = RAMP[i];
  out.copy(a.c).lerp(b.c, (t - a.t) / (b.t - a.t));
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

    // Live per-region color/glow/growth uniforms, lerped every frame.
    const regionColors = Array.from({ length: NREGIONS }, () => new THREE.Color(0x22222e));
    const regionGlow = new Float32Array(NREGIONS);
    const regionGrow = new Float32Array(NREGIONS);
    let growUnit = 0; // set from mesh height once the GLB loads
    const frameColor = new THREE.Color(light ? 0xb9b9cc : 0x343448);
    const skinColor = frameColor.clone().multiplyScalar(light ? 0.96 : 0.8);
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
      shader.uniforms.uGrow = { value: regionGrow };
      shader.uniforms.uSkin = { value: skinColor };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           attribute float aRegion;
           attribute float aCavity;
           attribute float aBorder;
           uniform vec3 uColors[${NREGIONS}];
           uniform float uGlow[${NREGIONS}];
           uniform float uGrow[${NREGIONS}];
           uniform vec3 uSkin;
           varying vec3 vRegionColor;
           varying vec3 vRegionEmissive;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           int rgn = int(aRegion + 0.5);
           vec3 rc = uColors[rgn];
           float rg = uGlow[rgn];
           // Anatomical highlight, not spray paint: color pools on the
           // muscle bellies and drains to bare skin in every groove — both
           // the wide seam between regions and the sculpt's own furrows —
           // so each muscle reads as a discrete painted shape.
           float seam = smoothstep(0.2, 0.7, aBorder);
           float belly = smoothstep(0.32, 0.6, aCavity);
           float paint = (1.0 - seam) * mix(0.3, 1.0, belly);
           vec3 colored = rc * mix(0.35, 1.2, aCavity);
           vec3 skin = uSkin * mix(0.5, 1.05, aCavity);
           vRegionColor = mix(skin, colored, paint);
           vRegionEmissive = rc * rg * mix(0.1, 1.0, pow(aCavity, 1.6)) * paint;
           // Trained muscles swell: displace bellies along the normal,
           // fading to zero in grooves and at region borders so the
           // surface stays continuous.
           transformed += objectNormal * (uGrow[rgn] * smoothstep(0.35, 0.85, aCavity) * (1.0 - seam));`
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

      // The whole weld → classify → watershed → seam pipeline lives in
      // segment.mjs, shared verbatim with scripts/verify-regions.mjs.
      const seg = segmentBody(soup);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(seg.weldPos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(seg.normal, 3));
      geo.setAttribute("aRegion", new THREE.BufferAttribute(Float32Array.from(seg.region), 1));
      geo.setAttribute("aCavity", new THREE.BufferAttribute(seg.cavity, 1));
      geo.setAttribute("aBorder", new THREE.BufferAttribute(seg.border, 1));
      geo.setIndex(new THREE.BufferAttribute(seg.index, 1));
      geo.clearGroups();
      geo.addGroup(0, seg.frameFaceCount * 3, 0);
      geo.addGroup(seg.frameFaceCount * 3, (seg.faceCount - seg.frameFaceCount) * 3, 1);
      faceRegion = seg.faceRegion;
      // Max belly displacement at the 20-set ceiling: ~0.4% of figure
      // height — a visible pump, not a balloon.
      growUnit = seg.height * 0.004;

      bodyMesh = new THREE.Mesh(geo, [frameMat, muscleMat]);
      const s = 3.7 / seg.height;
      bodyMesh.scale.set(s * (sex === "f" ? 0.96 : 1), s, s);
      bodyMesh.position.set(-seg.cx * s, -seg.minY * s, 0);
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
        // Emissive stays restrained below the floor so directional shading
        // keeps the bellies sculpted; past 10 sets the muscle starts to blaze.
        const glow = 0.04 + 0.16 * Math.min(p, 1) + 0.45 * Math.max(Math.min(p, 2) - 1, 0);
        regionGlow[i + 1] += (glow - regionGlow[i + 1]) * 0.12;
        const grow = growUnit * (Math.min(p, 2) / 2);
        regionGrow[i + 1] += (grow - regionGrow[i + 1]) * 0.12;
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

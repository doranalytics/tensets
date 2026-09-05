"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MUSCLES, MuscleKey } from "./muscles";
import { FRAME, NREGIONS, REGION_KEYS, segmentBody } from "./segment.mjs";

// A neutral sculpture at rest; coral marks work in progress, amber the
// ten-set target, and pale gold the top of the existing twenty-set range.
const HEAT = [
  { t: 0.15, color: new THREE.Color("#bd8274") },
  { t: 0.55, color: new THREE.Color("#ef8065") },
  { t: 1, color: new THREE.Color("#edb663") },
  { t: 2, color: new THREE.Color("#f8dfa4") },
];
const muscleName = (key: MuscleKey) =>
  MUSCLES.find((muscle) => muscle.key === key)?.name ?? key;

function heatColor(progress: number, neutral: THREE.Color, out: THREE.Color) {
  const t = THREE.MathUtils.clamp(
    Number.isFinite(progress) ? progress : 0,
    0,
    2,
  );
  if (t < HEAT[0].t)
    return out.copy(neutral).lerp(HEAT[0].color, t / HEAT[0].t);
  let i = 1;
  while (i < HEAT.length - 1 && HEAT[i].t < t) i++;
  return out
    .copy(HEAT[i - 1].color)
    .lerp(HEAT[i].color, (t - HEAT[i - 1].t) / (HEAT[i].t - HEAT[i - 1].t));
}

type View = "front" | "back" | "free";
type LoadState = "loading" | "ready" | "error";

export function Body3D({
  sex,
  light,
  progress,
  onPick,
}: {
  sex: "m" | "f";
  light: boolean;
  /** Sets / the ten-set target. Two is the twenty-set ceiling. */
  progress: Partial<Record<MuscleKey, number>>;
  onPick: (key: MuscleKey) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(progress);
  const pickRef = useRef(onPick);
  const rotateRef = useRef<((view: "front" | "back") => void) | null>(null);
  const [view, setView] = useState<View>("front");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [hovered, setHovered] = useState<MuscleKey | null>(null);
  const [retry, setRetry] = useState(0);
  progressRef.current = progress;
  pickRef.current = onPick;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setLoadState("loading");
    setHovered(null);
    setView("front");
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      setLoadState("error");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.touchAction = "pan-y";
    renderer.domElement.style.cursor = "grab";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Orthographic projection keeps head, hands, and feet in frame on
    // narrow phones, without enlarging the body parts nearest the lens.
    const camera = new THREE.OrthographicCamera(-2, 2, 2.2, -2.2, 0.1, 30);
    camera.position.set(0, 1.95, 8);
    camera.lookAt(0, 1.85, 0);

    scene.add(new THREE.HemisphereLight(0xf5f1e8, 0x363b3a, 1.0));
    const keyLight = new THREE.DirectionalLight(0xfff4e7, 2.35);
    keyLight.position.set(-3, 5, 5);
    scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0xd6e6ee, 0.55);
    fill.position.set(3, 2, 3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffead7, 1.6);
    rim.position.set(2, 4, -4);
    scene.add(rim);

    const figure = new THREE.Group();
    const querySpin = Number.parseFloat(
      new URLSearchParams(window.location.search).get("spin") ?? "0",
    );
    figure.rotation.y = Number.isFinite(querySpin) ? querySpin : 0;
    scene.add(figure);

    const neutral = new THREE.Color(light ? "#9eaaa7" : "#8d9b99");
    const frame = new THREE.Color(light ? "#aeb6b2" : "#8d9b99");
    const colors = Array.from({ length: NREGIONS }, (_, i) =>
      (i === FRAME ? frame : neutral).clone(),
    );
    const glow = new Float32Array(NREGIONS);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uColors = { value: colors };
      shader.uniforms.uGlow = { value: glow };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          attribute vec3 aBlendRegion;
          attribute vec3 aBlendWeight;
          attribute float aCavity;
          uniform vec3 uColors[${NREGIONS}];
          uniform float uGlow[${NREGIONS}];
          varying vec3 vMuscleColor;
          varying vec3 vMuscleGlow;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          int a = int(aBlendRegion.x + 0.5);
          int b = int(aBlendRegion.y + 0.5);
          int c = int(aBlendRegion.z + 0.5);
          // A narrow surface blend smooths the heat map's transitions
          // while preserving the original region labels used for picking.
          vec3 tone = uColors[a] * aBlendWeight.x + uColors[b] * aBlendWeight.y + uColors[c] * aBlendWeight.z;
          float contour = mix(0.8, 1.02, smoothstep(0.15, 0.9, aCavity));
          vMuscleColor = tone * contour;
          vMuscleGlow = uColors[a] * uGlow[a] * aBlendWeight.x
            + uColors[b] * uGlow[b] * aBlendWeight.y + uColors[c] * uGlow[c] * aBlendWeight.z;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vMuscleColor;
          varying vec3 vMuscleGlow;`,
        )
        .replace(
          "vec4 diffuseColor = vec4( diffuse, opacity );",
          "vec4 diffuseColor = vec4( vMuscleColor, opacity );",
        )
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n totalEmissiveRadiance += vMuscleGlow;",
        );
    };

    let body: THREE.Mesh | null = null;
    let faceRegion: Uint8Array | null = null;
    let hoverRegion = FRAME;
    const setHover = (region: number) => {
      if (hoverRegion === region) return;
      hoverRegion = region;
      setHovered(region > FRAME ? REGION_KEYS[region - 1] : null);
      renderer.domElement.style.cursor = region > FRAME ? "pointer" : "grab";
      requestRender();
    };

    new GLTFLoader().load(
      "/body.glb",
      (gltf) => {
        const chunks: THREE.BufferGeometry[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((object) => {
          if (!(object as THREE.Mesh).isMesh) return;
          const mesh = object as THREE.Mesh;
          if (!disposed) {
            const geometry = mesh.geometry.index
              ? mesh.geometry.toNonIndexed()
              : mesh.geometry.clone();
            geometry.applyMatrix4(mesh.matrixWorld);
            chunks.push(geometry);
          }
          mesh.geometry.dispose();
          for (const sourceMaterial of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material])
            sourceMaterial.dispose();
        });
        if (disposed) return;
        try {
          const length = chunks.reduce(
            (sum, geometry) => sum + geometry.attributes.position.array.length,
            0,
          );
          if (!length) throw new Error("Body model contains no geometry");
          const soup = new Float32Array(length);
          let offset = 0;
          for (const geometry of chunks) {
            soup.set(geometry.attributes.position.array, offset);
            offset += geometry.attributes.position.array.length;
            geometry.dispose();
          }
          const segmented = segmentBody(soup);
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(segmented.weldPos, 3),
          );
          geometry.setAttribute(
            "normal",
            new THREE.BufferAttribute(segmented.normal, 3),
          );
          geometry.setAttribute(
            "aBlendRegion",
            new THREE.BufferAttribute(segmented.blendRegion, 3),
          );
          geometry.setAttribute(
            "aBlendWeight",
            new THREE.BufferAttribute(segmented.blendWeight, 3),
          );
          geometry.setAttribute(
            "aCavity",
            new THREE.BufferAttribute(segmented.cavity, 1),
          );
          geometry.setIndex(new THREE.BufferAttribute(segmented.index, 1));
          geometry.computeBoundingSphere();
          faceRegion = segmented.faceRegion;
          body = new THREE.Mesh(geometry, material);
          const scale = 3.7 / segmented.height;
          // Keep the existing alternate figure proportion and data setting.
          const widthScale = scale * (sex === "f" ? 0.96 : 1);
          body.scale.set(widthScale, scale, scale);
          body.position.set(
            -segmented.cx * widthScale,
            -segmented.minY * scale,
            0,
          );
          figure.add(body);
          setLoadState("ready");
          requestRender();
        } catch {
          chunks.forEach((geometry) => geometry.dispose());
          setLoadState("error");
        }
      },
      undefined,
      () => {
        if (!disposed) setLoadState("error");
      },
    );

    let dragging = false;
    let activePointer: number | null = null;
    let lastX = 0;
    let moved = 0;
    let velocity = 0;
    let targetRotation: number | null = null;
    let rotationFrom = 0;
    let rotationStart = 0;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (event: PointerEvent) => {
      if (!body || !faceRegion) return FRAME;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(body)[0];
      return hit?.faceIndex != null ? faceRegion[hit.faceIndex] : FRAME;
    };
    const onDown = (event: PointerEvent) => {
      if (
        !event.isPrimary ||
        (event.pointerType === "mouse" && event.button !== 0)
      )
        return;
      dragging = true;
      activePointer = event.pointerId;
      lastX = event.clientX;
      moved = 0;
      velocity = 0;
      targetRotation = null;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (
        !event.isPrimary ||
        (activePointer !== null && activePointer !== event.pointerId)
      )
        return;
      if (!dragging) {
        setHover(pick(event));
        return;
      }
      const dx = event.clientX - lastX;
      moved += Math.abs(dx);
      lastX = event.clientX;
      if (moved > 5) {
        figure.rotation.y += dx * 0.009;
        velocity = dx * 0.009;
        setView("free");
        setHover(FRAME);
        renderer.domElement.style.cursor = "grabbing";
        requestRender();
      }
    };
    const endDrag = (event: PointerEvent, cancelled = false) => {
      if (!dragging || event.pointerId !== activePointer) return;
      dragging = false;
      activePointer = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grab";
      if (!cancelled && moved < 6) {
        const region = pick(event);
        if (region > FRAME) pickRef.current(REGION_KEYS[region - 1]);
      }
      if (cancelled) velocity = 0;
      requestRender();
    };
    const onUp = (event: PointerEvent) => endDrag(event);
    const onCancel = (event: PointerEvent) => endDrag(event, true);
    const onLeave = () => {
      if (!dragging) setHover(FRAME);
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    rotateRef.current = (nextView) => {
      velocity = 0;
      const target = nextView === "front" ? 0 : Math.PI;
      const normalized = THREE.MathUtils.euclideanModulo(
        figure.rotation.y,
        Math.PI * 2,
      );
      const delta =
        THREE.MathUtils.euclideanModulo(
          target - normalized + Math.PI,
          Math.PI * 2,
        ) - Math.PI;
      rotationFrom = figure.rotation.y;
      rotationStart = performance.now();
      targetRotation = figure.rotation.y + delta;
      if (reducedMotion.matches) {
        figure.rotation.y = targetRotation;
        targetRotation = null;
      }
      setView(nextView);
      setHover(FRAME);
      requestRender();
    };

    // Render on demand. Animate only rotation and changing data; a still
    // figure should not keep a phone GPU drawing sixty frames per second.
    let raf = 0;
    let visible = true;
    let previousTime = 0;
    const target = new THREE.Color();
    const hoverColor = new THREE.Color("#fff1d4");
    const tick = (time: number) => {
      raf = 0;
      if (disposed || !visible || document.hidden) return;
      const dt = Math.min((time - previousTime) / 16.667 || 1, 3);
      previousTime = time;
      const lerp = reducedMotion.matches ? 1 : 1 - Math.pow(0.82, dt);
      let changing = false;
      for (let i = 0; i < REGION_KEYS.length; i++) {
        const progress = progressRef.current[REGION_KEYS[i]] ?? 0;
        heatColor(progress, neutral, target);
        if (hoverRegion === i + 1) target.lerp(hoverColor, 0.38);
        const color = colors[i + 1];
        if (
          Math.abs(color.r - target.r) +
            Math.abs(color.g - target.g) +
            Math.abs(color.b - target.b) >
          0.001
        )
          changing = true;
        color.lerp(target, lerp);
        glow[i + 1] =
          Math.max(0, Math.min(progress, 2)) * 0.018 +
          (hoverRegion === i + 1 ? 0.025 : 0);
      }
      if (targetRotation !== null) {
        const elapsed = Math.min((time - rotationStart) / 280, 1);
        const eased = elapsed * elapsed * (3 - 2 * elapsed);
        figure.rotation.y =
          rotationFrom + (targetRotation - rotationFrom) * eased;
        if (elapsed >= 1) targetRotation = null;
        else changing = true;
      } else if (
        !dragging &&
        Math.abs(velocity) > 0.0001 &&
        !reducedMotion.matches
      ) {
        figure.rotation.y += velocity * dt;
        velocity *= Math.pow(0.88, dt);
        changing = true;
      }
      renderer.render(scene, camera);
      if (changing) requestRender();
    };
    function requestRender() {
      if (!raf && !disposed && visible && !document.hidden)
        raf = requestAnimationFrame(tick);
    }
    const onResize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      const aspect = width / height;
      // Include side-to-side clearance as well as head/foot clearance.
      const frameHeight = Math.max(4.3, 2.4 / aspect);
      camera.left = (-frameHeight * aspect) / 2;
      camera.right = (frameHeight * aspect) / 2;
      camera.top = frameHeight / 2;
      camera.bottom = -frameHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) requestRender();
    });
    intersectionObserver.observe(mount);
    const onVisibility = () => requestRender();
    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (!disposed) setLoadState("error");
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onCancel);
    renderer.domElement.addEventListener("lostpointercapture", onCancel);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    document.addEventListener("visibilitychange", onVisibility);
    // Prop changes request one frame through an event on the mount.
    mount.addEventListener("body-progress", requestRender);
    onResize();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      rotateRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      mount.removeEventListener("body-progress", requestRender);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onCancel);
      renderer.domElement.removeEventListener("lostpointercapture", onCancel);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
      );
      body?.geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [sex, light, retry]);

  useEffect(() => {
    mountRef.current?.dispatchEvent(new Event("body-progress"));
  }, [progress]);

  const hoveredSets = hovered ? Math.round((progress[hovered] ?? 0) * 10) : 0;
  return (
    <div
      className="overflow-hidden rounded-[24px] border border-line"
      style={{ background: light ? "#e9eeea" : "#191e1e" }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: light
              ? "radial-gradient(ellipse at 50% 42%, #fffdf6 0%, transparent 68%)"
              : "radial-gradient(ellipse at 50% 42%, #343b37 0%, transparent 68%)",
          }}
        />
        <div className="pointer-events-none absolute inset-x-5 top-4 z-10 flex items-start justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-faint">
            Weekly muscle map
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
            {view === "free" ? "360° view" : `${view} view`}
          </span>
        </div>
        <div
          className="pointer-events-none absolute bottom-6 left-1/2 h-5 w-36 -translate-x-1/2 rounded-[50%] blur-md"
          style={{ background: light ? "#63736b38" : "#00000070" }}
        />
        <div
          ref={mountRef}
          className="relative h-[56svh] min-h-[400px] max-h-[560px] w-full"
          role="img"
          aria-label="Interactive 3D muscle map. Drag horizontally to rotate, or use the front and back buttons. Tap a muscle to open its log."
        />
        {loadState === "loading" && (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3"
          >
            <span className="size-6 animate-spin rounded-full border-2 border-line border-t-current text-sub motion-reduce:animate-none" />
            <span className="text-xs text-sub">Preparing your muscle map…</span>
          </div>
        )}
        {loadState === "error" && (
          <div
            role="status"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center"
            style={{ background: "var(--panel)" }}
          >
            <p className="text-sm text-ink">The 3D view couldn&apos;t load.</p>
            <p className="max-w-xs text-xs leading-relaxed text-sub">
              You can still choose a muscle below to open your training log.
            </p>
            <button
              onClick={() => setRetry((value) => value + 1)}
              className="mt-1 rounded-full border border-line px-4 py-2 text-xs text-ink"
            >
              Try again
            </button>
          </div>
        )}
        {hovered && loadState === "ready" && (
          <div
            className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-[11px] text-ink shadow-sm"
            style={{ background: "var(--panel)" }}
          >
            {muscleName(hovered)}{" "}
            <span className="ml-1.5 text-sub">{hoveredSets} / 10 sets</span>
          </div>
        )}
      </div>
      <div
        className="relative border-t border-line px-4 pb-4 pt-3"
        style={{ background: "var(--panel)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div
            className="flex rounded-full border border-line p-1"
            role="group"
            aria-label="Body view"
          >
            {(["front", "back"] as const).map((orientation) => (
              <button
                key={orientation}
                disabled={loadState !== "ready"}
                aria-pressed={view === orientation}
                onClick={() => rotateRef.current?.(orientation)}
                className="rounded-full px-4 py-1.5 text-xs capitalize transition-colors disabled:opacity-40"
                style={{
                  background:
                    view === orientation ? "var(--ink)" : "transparent",
                  color: view === orientation ? "var(--bg)" : "var(--sub)",
                }}
              >
                {orientation}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-faint">
            Drag to rotate · tap to log
          </span>
        </div>
        <div
          className="mt-4 grid grid-cols-4 gap-2 text-[9px] text-sub"
          aria-label="Muscle colors: neutral at zero, coral at five, amber at ten, pale gold at twenty sets"
        >
          {[
            ["#8d9b99", "0 · Resting"],
            ["#ef8065", "5 · Building"],
            ["#edb663", "10 · Target"],
            ["#f8dfa4", "20 · Ceiling"],
          ].map(([color, label]) => (
            <div key={label}>
              <div
                className="mb-1.5 h-1 rounded-full"
                style={{ background: color }}
              />
              {label}
            </div>
          ))}
        </div>
        <label className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-xs text-sub">
          Explore a muscle
          <select
            value=""
            aria-label="Choose a muscle to open its log"
            onChange={(event) => {
              if (event.target.value) onPick(event.target.value as MuscleKey);
            }}
            className="max-w-[60%] rounded-md border border-line bg-transparent px-2 py-1.5 text-xs text-ink"
          >
            <option value="">Choose muscle</option>
            {MUSCLES.map((muscle) => (
              <option key={muscle.key} value={muscle.key}>
                {muscle.name} · {Math.round((progress[muscle.key] ?? 0) * 10)}{" "}
                sets
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

// Dev-only: slice the body GLB into horizontal bands and report the lateral
// clusters (torso vs arms) and depth extents, in three.js world space
// (raw Blender Z-up → Y-up: x, y=rawZ, z=-rawY).
import { NodeIO } from "@gltf-transform/core";

const io = new NodeIO();
const doc = await io.read(process.argv[2]);
const positions = [];
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const arr = prim.getAttribute("POSITION").getArray();
    for (let i = 0; i < arr.length; i += 3)
      positions.push([arr[i], -arr[i + 2], arr[i + 1]]);
  }
}
let minY = Infinity, maxY = -Infinity;
for (const p of positions) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
const H = maxY - minY;
console.log("height", H.toFixed(3), "minY", minY.toFixed(3), "maxY", maxY.toFixed(3));

for (let f = 0.3; f <= 0.95; f += 0.025) {
  const y0 = minY + H * f, y1 = y0 + H * 0.025;
  const slice = positions.filter((p) => p[1] >= y0 && p[1] < y1);
  if (!slice.length) { console.log(f.toFixed(3), "empty"); continue; }
  const pts = slice.slice().sort((a, b) => a[0] - b[0]);
  const clusters = [];
  let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] - pts[i - 1][0] > H * 0.012) { clusters.push(cur); cur = []; }
    cur.push(pts[i]);
  }
  clusters.push(cur);
  const desc = clusters
    .filter((c) => c.length > 3)
    .map((c) => {
      const xs = c.map((p) => p[0] / H);
      const zs = c.map((p) => p[2] / H);
      return `x[${Math.min(...xs).toFixed(2)},${Math.max(...xs).toFixed(2)}] z[${Math.min(...zs).toFixed(2)},${Math.max(...zs).toFixed(2)}]`;
    })
    .join("  ");
  console.log(f.toFixed(3), desc);
}

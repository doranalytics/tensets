// QA gate for the body segmentation: runs the SAME pipeline the app ships
// (app/segment.mjs) over public/body.glb and asserts every tracked muscle
// is actually representable on screen:
//   - has a healthy number of vertices and faces,
//   - exists on both sides of the body (bilateral),
//   - faces the direction a user would look for it (front delts visible
//     from the front, lats from the back, ...).
// Exits 1 on any failure. Run: node scripts/verify-regions.mjs
import { NodeIO } from "@gltf-transform/core";
import { FRAME, REGION_KEYS, segmentBody } from "../app/segment.mjs";

const io = new NodeIO();
const doc = await io.read(new URL("../public/body.glb", import.meta.url).pathname);

// Build the world-space triangle soup exactly like the runtime does
// (node transforms applied, indices expanded).
function mat4Mul(a, b) {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const soupParts = [];
function walk(node, parent) {
  const world = mat4Mul(parent, node.getMatrix());
  const mesh = node.getMesh();
  if (mesh) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION").getArray();
      const idxAcc = prim.getIndices();
      const idx = idxAcc ? idxAcc.getArray() : null;
      const n = idx ? idx.length : pos.length / 3;
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = idx ? idx[i] : i;
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        out[i * 3] = world[0] * x + world[4] * y + world[8] * z + world[12];
        out[i * 3 + 1] = world[1] * x + world[5] * y + world[9] * z + world[13];
        out[i * 3 + 2] = world[2] * x + world[6] * y + world[10] * z + world[14];
      }
      soupParts.push(out);
    }
  }
  for (const child of node.listChildren()) walk(child, world);
}
for (const scene of doc.getRoot().listScenes())
  for (const node of scene.listChildren()) walk(node, I);
let total = 0;
for (const p of soupParts) total += p.length;
const soup = new Float32Array(total);
let off = 0;
for (const p of soupParts) { soup.set(p, off); off += p.length; }

const seg = segmentBody(soup);
console.log(`soup=${soup.length / 3} welded=${seg.weldCount} faces=${seg.faceCount} height=${seg.height.toFixed(3)}`);

// Per-region stats: vertex/face counts, left/right balance, facing shares.
const NR = REGION_KEYS.length + 1;
const verts = new Array(NR).fill(0);
const leftVerts = new Array(NR).fill(0);
for (let w = 0; w < seg.weldCount; w++) {
  const r = seg.region[w];
  verts[r]++;
  if (seg.weldPos[w * 3] < seg.cx) leftVerts[r]++;
}
const faces = new Array(NR).fill(0);
const front = new Array(NR).fill(0);
const back = new Array(NR).fill(0);
const lateral = new Array(NR).fill(0);
for (let f = 0; f < seg.faceCount; f++) {
  const r = seg.faceRegion[f];
  faces[r]++;
  const a = seg.index[f * 3], b = seg.index[f * 3 + 1], c = seg.index[f * 3 + 2];
  // Face normal from the vertex normals' average (welded mesh is smooth).
  let nx = 0, ny = 0, nz = 0;
  for (const v of [a, b, c]) {
    nx += seg.normal[v * 3];
    ny += seg.normal[v * 3 + 1];
    nz += seg.normal[v * 3 + 2];
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; nz /= l;
  if (nz > 0.25) front[r]++;
  if (nz < -0.25) back[r]++;
  if (Math.abs(nx) > 0.4) lateral[r]++;
}

const failures = [];
const expectFacing = {
  pecs: "front", "front-delts": "front", abs: "front", quads: "front",
  "rear-delts": "back", lats: "back", glutes: "back", hamstrings: "back",
  calves: "back", "lower-back": "back", traps: "back",
  "side-delts": "lateral",
};
console.log("\nregion         verts  faces  L/R    %front %back %lat");
for (let i = 0; i < REGION_KEYS.length; i++) {
  const r = i + 1;
  const key = REGION_KEYS[i];
  const lr = verts[r] ? leftVerts[r] / verts[r] : 0;
  const pf = faces[r] ? front[r] / faces[r] : 0;
  const pb = faces[r] ? back[r] / faces[r] : 0;
  const pl = faces[r] ? lateral[r] / faces[r] : 0;
  console.log(
    `${key.padEnd(14)} ${String(verts[r]).padStart(5)} ${String(faces[r]).padStart(6)}  ${lr.toFixed(2)}   ${(pf * 100).toFixed(0).padStart(5)}% ${(pb * 100).toFixed(0).padStart(4)}% ${(pl * 100).toFixed(0).padStart(4)}%`
  );
  if (verts[r] < 40) failures.push(`${key}: only ${verts[r]} vertices`);
  if (faces[r] < 60) failures.push(`${key}: only ${faces[r]} pickable faces`);
  if (lr < 0.3 || lr > 0.7) failures.push(`${key}: left/right imbalance ${lr.toFixed(2)}`);
  const want = expectFacing[key];
  if (want === "front" && pf < 0.35) failures.push(`${key}: only ${(pf * 100).toFixed(0)}% front-facing`);
  if (want === "back" && pb < 0.35) failures.push(`${key}: only ${(pb * 100).toFixed(0)}% back-facing`);
  if (want === "lateral" && pl < 0.3) failures.push(`${key}: only ${(pl * 100).toFixed(0)}% lateral-facing`);
}
const frameShare = verts[FRAME] / seg.weldCount;
console.log(`frame share ${(frameShare * 100).toFixed(1)}%`);
if (frameShare > 0.45) failures.push(`frame swallowed the body: ${(frameShare * 100).toFixed(1)}%`);

if (failures.length) {
  console.error("\nFAIL:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("\nPASS: all 18 muscles present, bilateral, and facing the right way");

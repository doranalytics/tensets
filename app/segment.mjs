// Carve the sculpted body mesh into the tracked muscle regions.
//
// Plain ESM JavaScript (typed via JSDoc) on purpose: the exact same module
// runs inside the Next bundle (imported by body3d.tsx) and under plain
// `node` in scripts/verify-regions.mjs — the code that ships is the code
// QA measures, so the two can never drift apart.
//
// The pipeline, in order:
//   1. weld the triangle soup into an indexed mesh + neighbor graph
//   2. seed a region per vertex from analytic landmark bands (classify),
//      whose constants were measured off the mesh by
//      scripts/verify-regions.mjs — joints sit at girth minima, the deltoid
//      split at surface-area thirds of the shoulder ball
//   3. denoise with two majority-smoothing passes
//   4. compute smooth normals and a cavity field (belly vs groove)
//   5. watershed relaxation: region frontiers walk across muscle bellies
//      and stall in grooves, so borders settle into the sculpt's actual
//      anatomy instead of the classifier's cutting planes
//   6. flip stranded label islands to their surrounding region
//   7. mark a soft border band between adjacent regions — rendered as bare
//      skin, so each muscle reads as its own shape

/** @type {import("./muscles").MuscleKey[]} */
export const REGION_KEYS = [
  "pecs",
  "front-delts",
  "side-delts",
  "rear-delts",
  "triceps",
  "lats",
  "traps",
  "rotator-cuff",
  "biceps",
  "forearms",
  "hands",
  "abs",
  "obliques",
  "lower-back",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
];
export const FRAME = 0;
export const NREGIONS = REGION_KEYS.length + 1;
const R = Object.fromEntries(REGION_KEYS.map((k, i) => [k, i + 1]));

// Classify a point on the body surface into a region. Coordinates are
// fractions of total figure height: fy 0 at the feet → 1 at the crown,
// fx lateral from the midline, fz depth (+ is the front of the body).
// Landmarks measured from the mesh (see scripts/verify-regions.mjs):
// wrist crease fy≈0.47, elbow crease fy≈0.56, knee fy≈0.26–0.29; the
// deltoid ball spans fz −0.082..0.035 with area thirds at −0.057/−0.012.
/**
 * @param {number} fx @param {number} fy @param {number} fz
 * @returns {number}
 */
export function classify(fx, fy, fz) {
  const ax = Math.abs(fx);

  if (fy > 0.845) return FRAME; // head + upper neck

  // Arms hang free of the torso from the hands (~0.42) up to the deltoid
  // insertion (~0.72 — the delt owns the arm above that); the torso/arm
  // boundary drifts inward as the arm rises.
  if (fy > 0.41 && fy < 0.72) {
    const armBoundary = 0.165 - 0.289 * (fy - 0.45);
    if (ax > armBoundary) {
      if (fy < 0.472) return R["hands"]; // below the wrist crease
      if (fy < 0.615) return R["forearms"]; // below the elbow (~0.62 of stature)
      return fz > -0.032 ? R["biceps"] : R["triceps"];
    }
  }

  // Deltoid caps — three heads split by depth into true surface-area
  // thirds of the shoulder ball (measured fz spread −0.082..0.035).
  if (fy >= 0.69 && fy <= 0.815 && ax > 0.09) {
    if (fz > -0.012) return R["front-delts"];
    if (fz < -0.057) return R["rear-delts"];
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
      if (fy > 0.62)
        return ax < 0.045
          ? fy > 0.66
            ? R["traps"]
            : R["lower-back"]
          : R["lats"];
      if (ax < 0.05) return R["lower-back"];
      return ax > 0.09 ? R["obliques"] : R["lats"];
    }
    // front — the rectus column is ~0.075 half-width; flanks are obliques.
    if (fy > 0.655) return R["pecs"];
    return ax < 0.075 ? R["abs"] : R["obliques"];
  }

  // Hips 0.415–0.50: glutes behind, lower belly at the front midline,
  // top of the quads front-lateral.
  if (fy > 0.415) {
    if (fz < -0.02) return R["glutes"];
    if (fy > 0.48 && fz > 0.02 && ax < 0.075) return R["abs"];
    if (fz > 0.01 && ax > 0.04) return R["quads"];
    return FRAME; // pelvis / groin
  }

  // Thighs 0.295–0.415.
  if (fy > 0.295) return fz > -0.012 ? R["quads"] : R["hamstrings"];
  if (fy > 0.255) return FRAME; // knees (girth minimum 0.26–0.29)
  // Lower legs: calf mass bulges backward; the shin front stays frame.
  if (fy > 0.05) return fz < -0.028 ? R["calves"] : FRAME;
  return FRAME; // feet
}

/**
 * Run the full segmentation over a world-space triangle soup
 * (3 floats per vertex, 3 vertices per face, as from toNonIndexed()).
 *
 * @param {Float32Array} soup
 * @returns {{
 *   weldPos: Float32Array, normal: Float32Array, index: Uint32Array,
 *   region: Uint8Array, cavity: Float32Array, border: Float32Array,
 *   blendRegion: Float32Array, blendWeight: Float32Array,
 *   faceRegion: Uint8Array, frameFaceCount: number, faceCount: number,
 *   weldCount: number, height: number, minY: number, cx: number,
 * }}
 */
export function segmentBody(soup) {
  const soupCount = soup.length / 3;
  const faceCount = soupCount / 3;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < soupCount; i++) {
    const x = soup[i * 3],
      y = soup[i * 3 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const height = maxY - minY;
  const cx = (minX + maxX) / 2;

  // Weld by quantized position.
  const q = 1e4 / height;
  const weldIndex = new Map();
  const soupToWeld = new Uint32Array(soupCount);
  /** @type {number[]} */
  const weldPosArr = [];
  for (let i = 0; i < soupCount; i++) {
    const x = soup[i * 3],
      y = soup[i * 3 + 1],
      z = soup[i * 3 + 2];
    const k = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let w = weldIndex.get(k);
    if (w === undefined) {
      w = weldPosArr.length / 3;
      weldIndex.set(k, w);
      weldPosArr.push(x, y, z);
    }
    soupToWeld[i] = w;
  }
  const weldPos = Float32Array.from(weldPosArr);
  const weldCount = weldPos.length / 3;
  const index = new Uint32Array(soupCount);
  for (let i = 0; i < soupCount; i++) index[i] = soupToWeld[i];

  // Neighbor graph over welded vertices.
  /** @type {Set<number>[]} */
  const neighbors = Array.from({ length: weldCount }, () => new Set());
  for (let f = 0; f < faceCount; f++) {
    const a = index[f * 3],
      b = index[f * 3 + 1],
      c = index[f * 3 + 2];
    neighbors[a].add(b).add(c);
    neighbors[b].add(a).add(c);
    neighbors[c].add(a).add(b);
  }

  // Seed regions from the analytic bands, then denoise with two
  // majority-smoothing passes.
  let region = new Uint8Array(weldCount);
  for (let w = 0; w < weldCount; w++) {
    region[w] = classify(
      (weldPos[w * 3] - cx) / height,
      (weldPos[w * 3 + 1] - minY) / height,
      weldPos[w * 3 + 2] / height,
    );
  }
  const votes = new Float32Array(NREGIONS);
  for (let pass = 0; pass < 2; pass++) {
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

  // Smooth area-weighted vertex normals (cavity + lighting need them).
  const normal = new Float32Array(weldCount * 3);
  for (let f = 0; f < faceCount; f++) {
    const a = index[f * 3],
      b = index[f * 3 + 1],
      c = index[f * 3 + 2];
    const ax = weldPos[a * 3],
      ay = weldPos[a * 3 + 1],
      az = weldPos[a * 3 + 2];
    const ux = weldPos[b * 3] - ax,
      uy = weldPos[b * 3 + 1] - ay,
      uz = weldPos[b * 3 + 2] - az;
    const vx = weldPos[c * 3] - ax,
      vy = weldPos[c * 3 + 1] - ay,
      vz = weldPos[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      normal[v * 3] += nx;
      normal[v * 3 + 1] += ny;
      normal[v * 3 + 2] += nz;
    }
  }
  for (let w = 0; w < weldCount; w++) {
    const l =
      Math.hypot(normal[w * 3], normal[w * 3 + 1], normal[w * 3 + 2]) || 1;
    normal[w * 3] /= l;
    normal[w * 3 + 1] /= l;
    normal[w * 3 + 2] /= l;
  }

  // Cavity: how far a vertex sits above (belly) or below (groove) the
  // local neighborhood, measured along its normal and normalized by
  // edge length. Smoothed twice, then squashed to 0..1.
  const raw = new Float32Array(weldCount);
  for (let w = 0; w < weldCount; w++) {
    let mx = 0,
      my = 0,
      mz = 0,
      edge = 0,
      n = 0;
    const px = weldPos[w * 3],
      py = weldPos[w * 3 + 1],
      pz = weldPos[w * 3 + 2];
    for (const nb of neighbors[w]) {
      const bx = weldPos[nb * 3],
        by = weldPos[nb * 3 + 1],
        bz = weldPos[nb * 3 + 2];
      mx += bx;
      my += by;
      mz += bz;
      edge += Math.hypot(bx - px, by - py, bz - pz);
      n++;
    }
    if (!n) continue;
    mx /= n;
    my /= n;
    mz /= n;
    edge /= n;
    raw[w] =
      ((px - mx) * normal[w * 3] +
        (py - my) * normal[w * 3 + 1] +
        (pz - mz) * normal[w * 3 + 2]) /
      (edge || 1);
  }
  for (let pass = 0; pass < 2; pass++) {
    const sm = new Float32Array(weldCount);
    for (let w = 0; w < weldCount; w++) {
      let s = raw[w],
        n = 1;
      for (const nb of neighbors[w]) {
        s += raw[nb];
        n++;
      }
      sm[w] = s / n;
    }
    raw.set(sm);
  }
  const cavity = new Float32Array(weldCount);
  for (let w = 0; w < weldCount; w++) {
    // raw ~ [-0.3, 0.3]; ridges positive. Sigmoid-ish squash.
    cavity[w] = Math.min(1, Math.max(0, 0.55 + raw[w] * 3.5));
  }

  // Watershed relaxation: frontier vertices re-vote with neighbors
  // weighted by belly-ness (cavity^4), so a region expands across a muscle
  // belly it already dominates and stalls where the sculpt dips into a
  // groove. Borders end up tracing the anatomy the artist carved instead
  // of the classifier's straight cuts.
  //
  // Pinned boundaries do NOT relax — they cross smooth surface with no
  // groove to catch a frontier, so relaxing them floods one region into
  // its neighbor (verified empirically via scripts + isolation renders):
  //   - the three deltoid heads share one smooth ball,
  //   - the glute fold and the elbow bridge smooth masses,
  //   - frame↔muscle (abs marched down the smooth lower belly into the
  //     groin; quads onto the kneecap).
  const DELTS = new Set([R["front-delts"], R["side-delts"], R["rear-delts"]]);
  const pinnedPair = new Set(
    [
      [R["glutes"], R["hamstrings"]],
      [R["forearms"], R["biceps"]],
      [R["forearms"], R["triceps"]],
      [R["abs"], R["obliques"]],
    ].map(([a, b]) => `${Math.min(a, b)}|${Math.max(a, b)}`),
  );
  const pinned = (a, b) =>
    a === FRAME ||
    b === FRAME ||
    (DELTS.has(a) && DELTS.has(b)) ||
    pinnedPair.has(`${Math.min(a, b)}|${Math.max(a, b)}`);
  const weight = new Float32Array(weldCount);
  for (let w = 0; w < weldCount; w++)
    weight[w] = Math.pow(Math.max(cavity[w], 0.05), 4);
  for (let pass = 0; pass < 6; pass++) {
    const next = new Uint8Array(region);
    let changed = 0;
    for (let w = 0; w < weldCount; w++) {
      let frontier = false;
      for (const nb of neighbors[w])
        if (region[nb] !== region[w]) {
          frontier = true;
          break;
        }
      if (!frontier) continue;
      votes.fill(0);
      votes[region[w]] += weight[w] * 1.35; // inertia
      for (const nb of neighbors[w]) votes[region[nb]] += weight[nb];
      let best = region[w];
      for (let r = 0; r < NREGIONS; r++) {
        if (votes[r] <= votes[best]) continue;
        if (pinned(region[w], r)) continue;
        best = r;
      }
      if (best !== region[w]) {
        next[w] = best;
        changed++;
      }
    }
    region = next;
    if (!changed) break;
  }

  // Flip stranded islands: any connected patch under 20 vertices joins the
  // region that surrounds it. (Bilateral muscles are two big components —
  // far above the threshold, so left/right sides are never touched.)
  {
    const comp = new Int32Array(weldCount).fill(-1);
    for (let v = 0; v < weldCount; v++) {
      if (comp[v] !== -1) continue;
      const label = region[v];
      const members = [v];
      comp[v] = v;
      for (let head = 0; head < members.length; head++) {
        for (const nb of neighbors[members[head]]) {
          if (comp[nb] === -1 && region[nb] === label) {
            comp[nb] = v;
            members.push(nb);
          }
        }
      }
      if (members.length < 20) {
        votes.fill(0);
        for (const m of members)
          for (const nb of neighbors[m])
            if (region[nb] !== label) votes[region[nb]]++;
        let best = -1;
        for (let r = 0; r < NREGIONS; r++)
          if (best < 0 || votes[r] > votes[best]) best = r;
        if (best >= 0 && votes[best] > 0)
          for (const m of members) region[m] = best;
      }
    }
  }

  // Soft border band between adjacent regions — rendered as bare skin so
  // muscles read as separate shapes with a sliver of body between them.
  const border = new Float32Array(weldCount);
  for (let w = 0; w < weldCount; w++) {
    for (const nb of neighbors[w]) {
      if (region[nb] !== region[w]) {
        border[w] = 1;
        break;
      }
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const sm = new Float32Array(weldCount);
    for (let w = 0; w < weldCount; w++) {
      let s = border[w],
        n = 1;
      for (const nb of neighbors[w]) {
        s += border[nb];
        n++;
      }
      sm[w] = s / n;
    }
    border.set(sm);
  }
  for (let w = 0; w < weldCount; w++) border[w] = Math.min(1, border[w] * 1.4);

  // Diffuse region weights across four narrow rings of the surface.
  // Discrete labels still drive picking and the anatomical QA gate, while
  // these weights remove the saw-toothed paint borders on coarse triangles.
  // Retain the three dominant labels per vertex so the GPU can blend the
  // live weekly colors without repainting or rebuilding the mesh.
  let weights = new Float32Array(weldCount * NREGIONS);
  for (let w = 0; w < weldCount; w++) weights[w * NREGIONS + region[w]] = 1;
  for (let pass = 0; pass < 4; pass++) {
    const next = new Float32Array(weights.length);
    for (let w = 0; w < weldCount; w++) {
      const count = neighbors[w].size;
      for (let r = 0; r < NREGIONS; r++) {
        let sum = 0;
        for (const nb of neighbors[w]) sum += weights[nb * NREGIONS + r];
        next[w * NREGIONS + r] = count
          ? weights[w * NREGIONS + r] * 0.5 + (sum / count) * 0.5
          : weights[w * NREGIONS + r];
      }
    }
    weights = next;
  }
  const blendRegion = new Float32Array(weldCount * 3);
  const blendWeight = new Float32Array(weldCount * 3);
  for (let w = 0; w < weldCount; w++) {
    const ranked = Array.from({ length: NREGIONS }, (_, r) => r).sort(
      (a, b) => weights[w * NREGIONS + b] - weights[w * NREGIONS + a],
    );
    const total =
      weights[w * NREGIONS + ranked[0]] +
      weights[w * NREGIONS + ranked[1]] +
      weights[w * NREGIONS + ranked[2]];
    for (let k = 0; k < 3; k++) {
      blendRegion[w * 3 + k] = ranked[k];
      blendWeight[w * 3 + k] = weights[w * NREGIONS + ranked[k]] / total;
    }
  }

  // Face ordering: frame faces first, then muscle faces. The current
  // renderer uses one opaque material across both groups.
  // faces. A face is frame only when all three corners are frame, so
  // borders fade via vertex interpolation instead of cutting. faceRegion
  // (aligned to the sorted order) backs tap-to-pick.
  const isFrameFace = (f) =>
    region[index[f * 3]] === FRAME &&
    region[index[f * 3 + 1]] === FRAME &&
    region[index[f * 3 + 2]] === FRAME;
  /** @type {number[]} */
  const frameFaces = [];
  /** @type {number[]} */
  const muscleFaces = [];
  for (let f = 0; f < faceCount; f++)
    (isFrameFace(f) ? frameFaces : muscleFaces).push(f);
  const sortedIndex = new Uint32Array(soupCount);
  const faceRegion = new Uint8Array(faceCount);
  let fi = 0;
  for (const f of [...frameFaces, ...muscleFaces]) {
    const a = index[f * 3],
      b = index[f * 3 + 1],
      c = index[f * 3 + 2];
    sortedIndex[fi * 3] = a;
    sortedIndex[fi * 3 + 1] = b;
    sortedIndex[fi * 3 + 2] = c;
    const rs = [region[a], region[b], region[c]];
    faceRegion[fi] =
      rs.find((r) => r !== FRAME && rs.filter((x) => x === r).length >= 2) ??
      rs.find((r) => r !== FRAME) ??
      FRAME;
    fi++;
  }

  return {
    weldPos,
    normal,
    index: sortedIndex,
    region,
    cavity,
    border,
    blendRegion,
    blendWeight,
    faceRegion,
    frameFaceCount: frameFaces.length,
    faceCount,
    weldCount,
    height,
    minY,
    cx,
  };
}

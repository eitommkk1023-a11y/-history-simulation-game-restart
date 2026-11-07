// Measures the Bellona GLB (hull sections, masts, sails, rudder, decks) so the physics design is derived from the model, not guessed.
// usage: node tools/bellona-measure.mjs [out.json]
import fs from 'node:fs';
const dir = new URL('../assets/bellona/', import.meta.url);
function parseGlb(file) {
  const d = fs.readFileSync(file), jl = d.readUInt32LE(12), js = JSON.parse(d.slice(20, 20 + jl).toString()), bo = 20 + jl + 8, bin = d.slice(bo);
  return { js, bin };
}
const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; };
function local(n) {
  if (n.matrix) return n.matrix;
  const t = n.translation ?? [0, 0, 0], q = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1], [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [(1 - 2 * (yy + zz)) * s[0], (2 * (xy + wz)) * s[0], (2 * (xz - wy)) * s[0], 0, (2 * (xy - wz)) * s[1], (1 - 2 * (xx + zz)) * s[1], (2 * (yz + wx)) * s[1], 0, (2 * (xz + wy)) * s[2], (2 * (yz - wx)) * s[2], (1 - 2 * (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
}
export function walk(file) {
  const { js, bin } = parseGlb(file), out = [], I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const readAcc = (i) => { const a = js.accessors[i], bv = js.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = bv.byteStride ?? n * ({ 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType]); const get = { 5126: 'readFloatLE', 5125: 'readUInt32LE', 5123: 'readUInt16LE', 5121: 'readUInt8' }[a.componentType], sz = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType]; const r = []; for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) r.push(bin[get](off + k * stride + c * sz)); return { data: r, n }; };
  const visit = (idx, parent, path) => { const n = js.nodes[idx], m = mul(parent, local(n)), p = [...path, n.name ?? `#${idx}`]; if (n.mesh !== undefined) out.push({ path: p, name: n.name, mesh: js.meshes[n.mesh], matrix: m, extras: n.extras }); for (const c of n.children ?? []) visit(c, m, p); };
  for (const r of js.scenes[js.scene ?? 0].nodes) visit(r, I, []);
  const verts = (item) => { const res = []; for (const pr of item.mesh.primitives) { const { data } = readAcc(pr.attributes.POSITION); for (let i = 0; i < data.length; i += 3) { const [x, y, z] = [data[i], data[i + 1], data[i + 2]], M = item.matrix; res.push([M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]); } } return res; };
  const tris = (item) => { const res = []; for (const pr of item.mesh.primitives) { if (pr.indices === undefined) continue; const { data: P } = readAcc(pr.attributes.POSITION), { data: ix } = readAcc(pr.indices), M = item.matrix, v = (i) => { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; return [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; }; for (let k = 0; k < ix.length; k += 3) res.push([v(ix[k]), v(ix[k + 1]), v(ix[k + 2])]); } return res; };
  return { js, items: out, verts, tris };
}
const bbox = (vs) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const v of vs) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], v[i]); mx[i] = Math.max(mx[i], v[i]); } return { min: mn, max: mx }; };
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const g = walk(new URL('bellona-lod0-near.glb', dir));
  const groups = {}; for (const it of g.items) { const top = it.path.filter((p) => !/^(Scene)$/.test(p))[0] ?? '?'; (groups[top] ??= []).push(it); }
  for (const [k, v] of Object.entries(groups)) { const vs = v.flatMap((i) => g.verts(i)); const b = vs.length ? bbox(vs) : null; console.log(k.padEnd(26), v.length, b ? `x ${b.min[0].toFixed(1)}..${b.max[0].toFixed(1)}  y ${b.min[1].toFixed(1)}..${b.max[1].toFixed(1)}  z ${b.min[2].toFixed(1)}..${b.max[2].toFixed(1)}` : ''); }
}

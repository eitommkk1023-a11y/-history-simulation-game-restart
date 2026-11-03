/**
 * Road segments and constructed crossings on the existing geography cell grid.
 * Stored separately from procedural world arrays. All speed factors are test
 * inputs, not approved gameplay balance. No traffic/capacity simulation.
 */
export function createTransportNetwork(world, { width = 3000, height = 3000, kmPerBlock = 3.33, snapshot = null } = {}) {
  if (!world?.type || !world?.water || world.type.length !== width * height ||
      world.water.length !== width * height || !Number.isInteger(width) ||
      !Number.isInteger(height) || width < 1 || height < 1 ||
      !Number.isFinite(kmPerBlock) || kmPerBlock <= 0) {
    throw new TypeError('Invalid geography for transport network');
  }
  const links = new Map();
  const roadIndex = new Map();
  const crossingIndex = new Map();
  let version = 0;
  const index = ({ x, y }) => y * width + x;
  const within = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) &&
    p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  const edgeKey = (a, b) => a < b ? a + ":" + b : b + ":" + a;
  const land = p => world.type[index(p)] !== 0;
  const dry = p => land(p) && world.water[index(p)] === 0;
  function clone(link) {
    return { ...link, path: link.path.map(p => ({ ...p })), allowedModes: [...link.allowedModes] };
  }
  function validate(spec, allowExistingId = false, allowChangedTerrain = false) {
    if (!spec || typeof spec.id !== 'string' || !spec.id.trim() || (links.has(spec.id) && !allowExistingId))
      throw new Error('Each transport link needs a unique nonempty id');
    const { kind, path } = spec;
    if (!['road', 'bridge', 'ferry', 'ford'].includes(kind)) throw new TypeError('Unsupported link kind');
    if (!Array.isArray(path) || path.length < (kind === 'road' ? 2 : 3)) throw new RangeError('Invalid link path length');
    if (path.some(p => !within(p))) throw new RangeError('Link path outside geography');
    const seen = new Set();
    for (let k = 0; k < path.length; k++) {
      const p = path[k], i = index(p);
      if (seen.has(i)) throw new RangeError('Link path must not revisit a cell');
      seen.add(i);
      if (k) {
        const prev = path[k - 1], dx = Math.abs(p.x - prev.x), dy = Math.abs(p.y - prev.y);
        if (Math.max(dx, dy) !== 1 || (kind !== 'road' && dx + dy !== 1))
          throw new RangeError('Link path must use adjoining cells');
      }
      if (!allowChangedTerrain && kind === 'road' && !dry(p)) throw new RangeError('Road cannot be placed on water');
      if (!allowChangedTerrain && kind !== 'road' && ((k === 0 || k === path.length - 1) ? !dry(p) :
        (!land(p) || world.water[i] === 0)))
        throw new RangeError('Crossing must join dry banks across river/lake cells');
    }
    const status = spec.status ?? 'open';
    if (!['open', 'closed', 'destroyed'].includes(status)) throw new TypeError('Invalid status');
    const speedFactor = spec.speedFactor ?? 1;
    if (!Number.isFinite(speedFactor) || speedFactor <= 0) throw new RangeError('Invalid speed factor');
    const allowedModes = spec.allowedModes ?? ['foot'];
    if (!Array.isArray(allowedModes) || !allowedModes.length ||
        allowedModes.some(x => typeof x !== 'string' || !x.trim())) throw new TypeError('Invalid transport modes');
    if (spec.maxLoadKg != null && (!Number.isFinite(spec.maxLoadKg) || spec.maxLoadKg < 0))
      throw new RangeError('Invalid load limit');
    if (spec.travelHours != null && (!Number.isFinite(spec.travelHours) || spec.travelHours <= 0))
      throw new RangeError('Invalid crossing time');
    if (kind === 'road' && spec.level != null && (![1, 2, 3, 4].includes(spec.level)))
      throw new RangeError('Road importance must be 1–4');
    if (kind === 'ferry' && spec.operating != null && typeof spec.operating !== 'boolean')
      throw new TypeError('Invalid ferry operation state');
    return {
      id: spec.id, kind, path: path.map(p => ({ x: p.x, y: p.y })),
      status, speedFactor, allowedModes: [...new Set(allowedModes)],
      maxLoadKg: spec.maxLoadKg ?? null,
      travelHours: spec.travelHours ?? null,
      level: kind === 'road' ? (spec.level ?? 1) : null,
      operating: kind === 'ferry' ? (spec.operating ?? false) : null,
    };
  }
  function indexLink(link) {
    if (link.kind === 'road') {
      for (let k = 1; k < link.path.length; k++) {
        const key = edgeKey(index(link.path[k - 1]), index(link.path[k]));
        if (!roadIndex.has(key)) roadIndex.set(key, new Set());
        roadIndex.get(key).add(link.id);
      }
    } else {
      for (const p of [link.path[0], link.path.at(-1)]) {
        const i = index(p);
        if (!crossingIndex.has(i)) crossingIndex.set(i, new Set());
        crossingIndex.get(i).add(link.id);
      }
    }
  }
  function unindexLink(link) {
    const map = link.kind === 'road' ? roadIndex : crossingIndex;
    if (link.kind === 'road') {
      for (let k = 1; k < link.path.length; k++) {
        const key = edgeKey(index(link.path[k - 1]), index(link.path[k]));
        map.get(key)?.delete(link.id);
        if (map.get(key)?.size === 0) map.delete(key);
      }
    } else {
      for (const p of [link.path[0], link.path.at(-1)]) {
        const key = index(p);
        map.get(key)?.delete(link.id);
        if (map.get(key)?.size === 0) map.delete(key);
      }
    }
  }
  function add(spec) {
    const link = validate(spec);
    links.set(link.id, link); indexLink(link); version++;
    return clone(link);
  }
  function remove(id) {
    const link = links.get(id);
    if (!link) return false;
    unindexLink(link); links.delete(id); version++;
    return true;
  }
  function update(id, changes) {
    const link = links.get(id);
    if (!link) throw new RangeError('Unknown transport link');
    const allowed = ['status', 'operating', 'speedFactor', 'travelHours', 'level'];
    if (!changes || Object.keys(changes).some(k => !allowed.includes(k)))
      throw new TypeError('Unsupported link change');
    // Validate first; no partial mutation if invalid.
    const replacement = validate({ ...link, ...changes }, true);
    links.set(id, replacement); version++;
    return clone(replacement);
  }
  function validOnTerrain(link) {
    const path = link.path;
    // Land road edges are checked by the route at each step. A flooded section
    // must not disable unrelated sections of a long road.
    return link.kind === 'road' ? true :
      path.every((p, k) => k === 0 || k === path.length - 1 ? dry(p) : land(p) && world.water[index(p)] !== 0);
  }
  function usable(link, { mode = 'foot', loadKg = 0, knowsFacility, canUse } = {}) {
    return link.status === 'open' && validOnTerrain(link) &&
      link.allowedModes.includes(mode) && (link.maxLoadKg == null || loadKg <= link.maxLoadKg) &&
      (link.kind !== 'ferry' || link.operating) &&
      (!knowsFacility || knowsFacility(link.id, link)) &&
      (!canUse || canUse(link));
  }
  function roadFor(from, to, context) {
    const ids = roadIndex.get(edgeKey(from, to));
    let best = null;
    if (ids) for (const id of ids) {
      const link = links.get(id);
      if (usable(link, context) && (!best || best.speedFactor < link.speedFactor)) best = link;
    }
    // Avoid copying an entire road polyline for every routing expansion.
    return best ? { id: best.id, kind: best.kind, speedFactor: best.speedFactor } : null;
  }
  function crossingsFrom(from, context) {
    const result = [];
    for (const id of crossingIndex.get(from) ?? []) {
      const link = links.get(id);
      if (!usable(link, context)) continue;
      const a = index(link.path[0]), b = index(link.path.at(-1));
      result.push({ to: a === from ? b : a, link: clone(link) });
    }
    return result;
  }
  function get(id) { const link = links.get(id); return link ? clone(link) : null; }
  function snapshotState() {
    return { format: 1, version, width, height, kmPerBlock, links: [...links.values()].map(clone) };
  }
  if (snapshot) {
    if (snapshot.format !== 1 || snapshot.width !== width || snapshot.height !== height ||
        snapshot.kmPerBlock !== kmPerBlock || !Array.isArray(snapshot.links))
      throw new Error('Incompatible transport snapshot');
    for (const saved of snapshot.links) {
      // Preserve destroyed, flooded or obsolete facilities as historical records.
      // Their actual passability is still checked at routing time.
      const link = validate(saved, false, true);
      links.set(link.id, link); indexLink(link); version++;
    }
    if (!Number.isSafeInteger(snapshot.version) || snapshot.version < snapshot.links.length) throw new RangeError("Invalid snapshot version");
    version = snapshot.version;
  }
  return Object.freeze({ add, remove, update, get, roadFor, crossingsFrom, snapshot: snapshotState,
    get version() { return version; } });
}

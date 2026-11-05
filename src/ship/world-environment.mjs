/**
 * Read-only adapter: existing world data (window.__geo.world) -> ship environment.
 * Ship frame: X east, Y north, metres. World blocks: x east, y SOUTH (y grows southward), so
 * block y = origin.y - Y / blockM. This flip lives only here.
 * Reads: world.elev/type (3000 x 3000 blocks), world.climate.cell {gridStep, gridW, gridH,
 * windDir[12*n] (0-255 = 0-360 deg, direction the wind comes FROM, north = 0, clockwise),
 * windSpeed[12*n] (x10 m/s), currentU/currentV[n] (x100 m/s, east/north)}.
 * Resolution is one block (~3.33 km) for depth and one climate cell for wind/current: coasts and
 * shoals smaller than that are NOT resolved. No tides, waves or seabed-type data exist yet.
 * Wind is monthly-mean (no gusts); the month is blended with the neighbour around mid-month.
 */
const TWO_PI = Math.PI * 2;
const DAYS_PER_MONTH = 30, DAYS_PER_YEAR = 360;

export function createWorldEnvironment(world, {
  origin, width = 3000, height = 3000, blockM = 3330, dayAt = () => 0, seabed = 'sand',
} = {}) {
  if (!world?.elev || !world?.type) throw new TypeError('world.elev and world.type are required');
  const n = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new TypeError('invalid world size');
  if (world.elev.length !== n || world.type.length !== n) throw new TypeError(`world.elev/type must have ${n} cells`);
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) throw new TypeError('origin {x, y} (block coordinates of ship position 0,0) is required');
  if (!(blockM > 0)) throw new RangeError('blockM must be > 0');
  const cell = world.climate?.cell;
  if (!cell) throw new TypeError('world.climate.cell is required');
  const { gridStep: step, gridW: gw, gridH: gh } = cell, cn = gw * gh;
  if (!(step > 0) || !Number.isInteger(gw) || !Number.isInteger(gh)) throw new TypeError('invalid climate grid');
  if (cell.windDir?.length !== 12 * cn || cell.windSpeed?.length !== 12 * cn) throw new TypeError('windDir/windSpeed must have 12 * gridW * gridH entries');
  if (cell.currentU?.length !== cn || cell.currentV?.length !== cn) throw new TypeError('currentU/currentV must have gridW * gridH entries');

  const toBlock = (X, Y) => ({ x: origin.x + X / blockM, y: origin.y - Y / blockM });
  const toShip = (bx, by) => ({ X: (bx - origin.x) * blockM, Y: (origin.y - by) * blockM });
  const clampI = (v, hi) => Math.min(hi, Math.max(0, v));

  /** Bilinear sample of a scalar field on cell centres (centre of cell i is at i + 0.5). */
  function bilinear(fx, fy, w, h, at) {
    const x = fx - 0.5, y = fy - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    const g = (i, j) => at(clampI(i, w - 1), clampI(j, h - 1));
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  }

  function monthWind(month, fx, fy) {
    const base = month * cn, at = (c) => (i, j) => {
      const k = base + j * gw + i, th = cell.windDir[k] / 256 * TWO_PI, sp = cell.windSpeed[k] / 10;
      return c === 0 ? -Math.sin(th) * sp : -Math.cos(th) * sp; // direction the wind blows TOWARD: east, north
    };
    return { x: bilinear(fx, fy, gw, gh, at(0)), y: bilinear(fx, fy, gw, gh, at(1)) };
  }

  function wind(X, Y, t = 0) {
    const b = toBlock(X, Y), fx = b.x / step, fy = b.y / step;
    const day = dayAt(t), doy = ((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
    const mf = (doy - 15) / DAYS_PER_MONTH, m0 = Math.floor(mf), w1 = mf - m0;
    const a = monthWind(((m0 % 12) + 12) % 12, fx, fy), c = monthWind((((m0 + 1) % 12) + 12) % 12, fx, fy);
    return { x: a.x * (1 - w1) + c.x * w1, y: a.y * (1 - w1) + c.y * w1 };
  }

  const isLandAt = (bx, by) => world.type[clampI(Math.floor(by), height - 1) * width + clampI(Math.floor(bx), width - 1)] !== 0;

  function current(X, Y) {
    const b = toBlock(X, Y);
    if (isLandAt(b.x, b.y)) return { x: 0, y: 0 };
    const fx = b.x / step, fy = b.y / step;
    return {
      x: bilinear(fx, fy, gw, gh, (i, j) => cell.currentU[j * gw + i]) / 100,
      y: bilinear(fx, fy, gw, gh, (i, j) => cell.currentV[j * gw + i]) / 100,
    };
  }

  function depth(X, Y) {
    const b = toBlock(X, Y);
    if (isLandAt(b.x, b.y)) return 0;
    const e = bilinear(b.x, b.y, width, height, (i, j) => world.elev[j * width + i]);
    return e < 0 ? -e : 0;
  }

  const seabedFn = typeof seabed === 'function' ? seabed : () => seabed;
  return Object.freeze({
    wind, current, depth, seabed: (X, Y, t) => seabedFn(X, Y, t),
    toBlock, toShip, blockM,
  });
}

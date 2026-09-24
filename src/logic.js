// Pure game rules — no three.js, so they can be unit-tested in Node.

export const ARENA_R = 13.2;          // walkable radius of the island
export const PLAYER_R = 0.42;
export const SHRINE = { x: 0, z: 0, pickupR: 1.35 };

// Rune pillars inside the arena (circle colliders).
export const OBSTACLES = [45, 135, 225, 315].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.sin(a) * 7.4, z: Math.cos(a) * 7.4, r: 0.78 };
});

// Enemy portals on the rim.
export const PORTALS = [0, 90, 180, 270].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.sin(a) * 12.4, z: Math.cos(a) * 12.4, angle: a };
});

export const PLAYER = { maxHp: 100, speed: 6.2, accel: 38, invul: 0.7 };

export const SKILLS = {
  slash: { cd: 0.42, dmg: 24, range: 2.7, arc: 2.3, knock: 5 },
  bolt: { cd: 1.0, dmg: 36, speed: 20, life: 0.9, radius: 0.55, knock: 4 },
  nova: { cd: 6.5, dmg: 44, radius: 4.4, knock: 9 },
  dash: { cd: 2.0, speed: 24, time: 0.2 },
  ult: { cost: 100, dmg: 95, radius: 2.4, count: 12, area: 10 },
};

export const ENEMY_TYPES = {
  slime: { hp: 44, speed: 2.5, dmg: 10, r: 0.55, reach: 1.15, windup: 0.42, score: 10, souls: 1, height: 1.2 },
  wisp: { hp: 30, speed: 4.0, dmg: 9, r: 0.45, reach: 1.25, windup: 0.32, score: 14, souls: 1, height: 1.9 },
  golem: { hp: 160, speed: 1.6, dmg: 20, r: 0.95, reach: 1.9, windup: 0.75, score: 35, souls: 3, height: 2.5 },
  boss: { hp: 1300, speed: 1.75, dmg: 22, r: 1.9, reach: 3.1, windup: 0.8, score: 400, souls: 10, height: 5.0 },
};

export const WAVES = [
  { name: 'Bóng tối rỉ ra', spawn: [['slime', 8]], interval: 1.0, maxAlive: 6, hpMul: 1, spdMul: 1 },
  { name: 'Ma trơi lượn quanh', spawn: [['slime', 8], ['wisp', 6]], interval: 0.8, maxAlive: 9, hpMul: 1.1, spdMul: 1.05 },
  { name: 'Thạch quỷ thức giấc', spawn: [['slime', 8], ['wisp', 8], ['golem', 3]], interval: 0.7, maxAlive: 11, hpMul: 1.2, spdMul: 1.1 },
  { name: 'Cơn lũ đêm trăng', spawn: [['slime', 10], ['wisp', 10], ['golem', 5]], interval: 0.55, maxAlive: 14, hpMul: 1.35, spdMul: 1.15 },
  { name: 'Hắc Nguyệt Thú', spawn: [['boss', 1], ['slime', 8], ['wisp', 8]], interval: 2.2, maxAlive: 9, hpMul: 1.4, spdMul: 1.15, boss: true },
];

export const UPGRADE = { dmg: 0.12, maxHp: 10, heal: 0.4 };

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flattened, shuffled spawn list. The boss (if any) always comes first. */
export function buildSpawnQueue(waveIndex, rand = Math.random) {
  const w = WAVES[waveIndex];
  const list = [];
  for (const [type, n] of w.spawn) for (let i = 0; i < n; i++) list.push(type);
  const boss = list.filter((t) => t === 'boss');
  const rest = list.filter((t) => t !== 'boss');
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...boss, ...rest];
}

export function waveTotal(waveIndex) {
  return WAVES[waveIndex].spawn.reduce((s, [, n]) => s + n, 0);
}

/** Normalised move vector — diagonals are not faster. Analog input (<1) is kept. */
export function moveVector(x, z) {
  const len = Math.hypot(x, z);
  if (len < 1e-4) return { x: 0, z: 0, len: 0 };
  const k = len > 1 ? 1 / len : 1;
  return { x: x * k, z: z * k, len: Math.min(1, len) };
}

/** Push a circle out of static colliders and keep it inside the arena. Mutates p. */
export function resolveCollisions(p, r, obstacles = OBSTACLES, arenaR = ARENA_R) {
  for (const o of obstacles) {
    const dx = p.x - o.x, dz = p.z - o.z;
    const d = Math.hypot(dx, dz), min = o.r + r;
    if (d < min) {
      const nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
      p.x = o.x + nx * min; p.z = o.z + nz * min;
    }
  }
  const d = Math.hypot(p.x, p.z), max = arenaR - r;
  if (d > max) { p.x *= max / d; p.z *= max / d; }
  return p;
}

/** Is target circle (ex,ez,er) inside a frontal arc of the attacker? facing = yaw (atan2(x,z)). */
export function inArc(px, pz, facing, ex, ez, range, arc, er = 0) {
  const dx = ex - px, dz = ez - pz;
  const d = Math.hypot(dx, dz);
  if (d - er > range) return false;
  if (d < er + 0.3) return true;
  let diff = Math.atan2(dx, dz) - facing;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) <= arc / 2 + Math.atan2(er, d);
}

export function damageRoll(base, mul, rand = Math.random) {
  const crit = rand() < 0.15;
  return { amount: Math.round(base * mul * (crit ? 1.8 : 1) * (0.92 + rand() * 0.16)), crit };
}

export class Cooldowns {
  constructor(defs) { this.defs = defs; this.t = {}; for (const k in defs) this.t[k] = 0; }
  ready(k) { return this.t[k] <= 0; }
  trigger(k, scale = 1) { this.t[k] = this.defs[k].cd * scale; }
  tick(dt) { for (const k in this.t) this.t[k] = Math.max(0, this.t[k] - dt); }
  ratio(k) { return this.defs[k].cd ? this.t[k] / this.defs[k].cd : 0; }
  reset() { for (const k in this.t) this.t[k] = 0; }
}

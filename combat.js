import { clamp, dist, angleDiff } from "./data.js";

// 空间哈希：用于子弹碰撞和敌人分离。
export class SpatialGrid {
  constructor(size = 80) {
    this.size = size;
    this.cells = new Map();
  }

  rebuild(enemies) {
    this.cells.clear();

    for (const e of enemies) {
      if (e.dead) continue;

      // 包含本帧起点和终点，支持相对运动碰撞。
      const x0 = Math.min(e.px ?? e.x, e.x) - e.r;
      const y0 = Math.min(e.py ?? e.y, e.y) - e.r;
      const x1 = Math.max(e.px ?? e.x, e.x) + e.r;
      const y1 = Math.max(e.py ?? e.y, e.y) + e.r;

      for (let x = Math.floor(x0 / this.size); x <= Math.floor(x1 / this.size); x++) {
        for (let y = Math.floor(y0 / this.size); y <= Math.floor(y1 / this.size); y++) {
          const key = x + "," + y;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(e);
        }
      }
    }
  }

  box(x0, y0, x1, y1) {
    const result = new Set();

    for (let x = Math.floor(x0 / this.size); x <= Math.floor(x1 / this.size); x++) {
      for (let y = Math.floor(y0 / this.size); y <= Math.floor(y1 / this.size); y++) {
        for (const e of this.cells.get(x + "," + y) || []) result.add(e);
      }
    }
    return result;
  }

  near(x, y, r) {
    return this.box(x - r, y - r, x + r, y + r);
  }
}

// 返回线段第一次进入圆的时刻；Infinity 表示没有碰撞。
export function segmentHit(x0, y0, x1, y1, cx, cy, radius) {
  const sx = x0 - cx, sy = y0 - cy;
  const dx = x1 - x0, dy = y1 - y0;
  const C = sx * sx + sy * sy - radius * radius;

  if (C <= 0) return 0;
  const A = dx * dx + dy * dy;
  if (A < 1e-10) return Infinity;

  const B = 2 * (sx * dx + sy * dy);
  const D = B * B - 4 * A * C;
  if (D < 0) return Infinity;

  const t = (-B - Math.sqrt(D)) / (2 * A);
  return t >= 0 && t <= 1 ? t : Infinity;
}

// 求解匀速目标的拦截时间。
// 对加速、转向的敌人只能预判，不能保证每发必中。
export function intercept(origin, target, speed = 920) {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const vx = target.vx || 0, vy = target.vy || 0;

  const A = vx * vx + vy * vy - speed * speed;
  const B = 2 * (dx * vx + dy * vy);
  const C = dx * dx + dy * dy;
  const roots = [];

  if (Math.abs(A) < 1e-8) {
    if (Math.abs(B) > 1e-8) roots.push(-C / B);
  } else {
    const D = B * B - 4 * A * C;
    if (D >= 0) {
      roots.push(
        (-B - Math.sqrt(D)) / (2 * A),
        (-B + Math.sqrt(D)) / (2 * A)
      );
    }
  }

  const positive = roots.filter(t => t >= 0 && Number.isFinite(t));
  const t = clamp(positive.length ? Math.min(...positive) : 0, 0, .65);

  return { x: target.x + vx * t, y: target.y + vy * t };
}

// 第一发偏移为零；后续弹道从左右枪口独立瞄准。
// 单目标时所有弹道都汇聚目标，不存在偶数中心空隙。
export function barrelOffset(index) {
  if (index === 0) return 0;
  return (index % 2 ? 1 : -1) * Math.ceil(index / 2) * 5;
}

export function shootVolley(g) {
  const p = g.p;
  let candidates = g.enemies.filter(e =>
    !e.dead && !e.spawning && dist(p, e) < 1050
  );

  let primary = null;
  let aim;

  if (g.input.manual) {
    aim = { ...g.input.aim };
    candidates.sort((a, b) => dist(a, aim) - dist(b, aim));

    // 手动瞄准只吸附准星附近的敌人，不抢走玩家瞄准方向。
    if (candidates[0] && dist(candidates[0], aim) < 95) {
      primary = candidates[0];
    }
  } else {
    // 近处优先，正在发动攻击的敌人获得少量优先级。
    candidates.sort((a, b) =>
      (dist(p, a) - (a.action ? 55 : 0)) -
      (dist(p, b) - (b.action ? 55 : 0))
    );
    primary = candidates[0];
    if (!primary) return false;
    aim = intercept(p, primary);
  }

  if (primary) aim = intercept(p, primary);
  const baseAngle = Math.atan2(aim.y - p.y, aim.x - p.x);
  p.a = baseAngle;

  // 限制副弹道在主方向前方选敌，避免枪口向右却向左开火。
  const secondary = candidates.filter(e =>
    e !== primary &&
    Math.abs(angleDiff(Math.atan2(e.y - p.y, e.x - p.x), baseAngle)) < .8
  );

  const assigned = new Map();
  const damage = p.damage * (p.buff > 0 ? 1.2 : 1) /
    (1 + .22 * (p.shots - 1));

  for (let i = 0; i < p.shots; i++) {
    let target = primary;

    if (i > 0) {
      const options = primary ? [primary, ...secondary] : secondary;

      // 尚未获得足够本轮伤害的目标优先；第一发固定主目标。
      const sorted = options.slice().sort((a, b) => {
        const score = e =>
          (assigned.get(e.id) || 0) >= e.hp
            ? 10000 + dist(p, e)
            : (assigned.get(e.id) || 0) * 12 + dist(p, e);
        return score(a) - score(b);
      });
      target = sorted[0] || primary;
    }

    const side = barrelOffset(i);

    // 枪口起点靠近角色中心，避免贴身敌人在枪口后面漏判。
    const origin = {
      x: p.x + Math.cos(baseAngle) * 11 - Math.sin(baseAngle) * side,
      y: p.y + Math.sin(baseAngle) * 11 + Math.cos(baseAngle) * side
    };

    const point = target ? intercept(origin, target) : aim;
    const angle = Math.atan2(point.y - origin.y, point.x - origin.x);
    const critical = Math.random() < p.crit;

    g.bullet(
      origin.x, origin.y, angle,
      damage * (critical ? 2 : 1),
      p.pierce, critical
    );

    if (target) assigned.set(target.id, (assigned.get(target.id) || 0) + damage);
  }

  p.muzzle = .07;
  g.sound(130, .035, .012);
  g.particles.push({
    kind: "shell", x: p.x, y: p.y,
    vx: Math.cos(baseAngle + 1.5) * 95,
    vy: Math.sin(baseAngle + 1.5) * 95,
    life: .6, max: .6, color: "#d7b478", size: 2
  });
  return true;
}

export function updateBullets(g, dt) {
  g.grid.rebuild(g.enemies);

  for (const b of g.bullets) {
    const ox = b.x, oy = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    const nearby = g.grid.box(
      Math.min(ox, b.x) - 4, Math.min(oy, b.y) - 4,
      Math.max(ox, b.x) + 4, Math.max(oy, b.y) + 4
    );

    const hits = [];

    for (const e of nearby) {
      if (e.dead || b.hits.has(e.id)) continue;

      // 把敌人的移动从子弹位移里减掉，得到相对运动。
      const t = segmentHit(
        ox - (e.px ?? e.x), oy - (e.py ?? e.y),
        b.x - e.x, b.y - e.y,
        0, 0, e.r + 3
      );

      if (Number.isFinite(t)) hits.push({ e, t });
    }

    hits.sort((a, b) => a.t - b.t);

    for (const { e } of hits) {
      if (e.dead || b.left <= 0) continue;
      b.hits.add(e.id);
      g.hit(e, b.damage, "bullet", b);
      g.spark(e.x, e.y, b.crit ? "#ffdfa0" : "#b6c9a4", 3);
      b.left--;

      if (!e.dead) {
        if (g.p.burn) {
          e.burn = 3;
          e.burnDps = g.p.damage * .10 * g.p.burn;
        }
        if (Math.random() < g.p.ice * .12) e.slow = 1.6;
      }

      if (g.p.chain && Math.random() < .18) {
        let last = e;
        const used = new Set([e.id]);

        for (let n = 0; n < g.p.chain; n++) {
          const next = [...g.grid.near(last.x, last.y, 165)]
            .filter(v => !v.dead && !used.has(v.id) && dist(last, v) < 165)
            .sort((a, b) => dist(last, a) - dist(last, b))[0];

          if (!next) break;
          used.add(next.id);

          g.effects.push({
            kind: "arc", x: last.x, y: last.y,
            tx: next.x, ty: next.y,
            life: .16, max: .16, color: "#b8e9ff"
          });
          g.hit(next, g.p.damage * .5);
          last = next;
        }
      }
    }
  }

  g.bullets = g.bullets.filter(b =>
    b.life > 0 && b.left > 0 &&
    b.x > -80 && b.x < 1180 && b.y > -80 && b.y < 780
  );
}
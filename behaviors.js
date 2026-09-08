import { MONSTERS, W, H, TAU, clamp, dist, angleDiff } from "./data.js";
import { segmentHit } from "./combat.js";

function move(e, angle, speed, dt) {
  e.x += Math.cos(angle) * speed * dt;
  e.y += Math.sin(angle) * speed * dt;
}

function prepare(e, kind, duration, range, extra = {}) {
  e.action = {
    kind, left: duration, total: duration,
    a: e.a, r: range, x: e.x, y: e.y,
    ...extra
  };
}

function chase(e, g, dt) {
  const d = dist(e, g.p);
  const a = Math.atan2(g.p.y - e.y, g.p.x - e.x);

  if (d > e.r + g.p.r + 4) move(e, a, e.currentSpeed, dt);

  if (d < e.r + 48 && e.cool <= 0) {
    prepare(e, "melee", e.type === "runner" ? .29 : .44, e.r + 47);
  }
}

export const BEHAVIORS = {
  melee: chase,

  slam(e, g, dt) {
    const d = dist(e, g.p);
    if (d > 105) move(e, e.a, e.currentSpeed, dt);
    if (d < 125 && e.cool <= 0) prepare(e, "slam", .85, 125);
  },

  spit(e, g, dt) {
    const d = dist(e, g.p);
    if (d > 350) move(e, e.a, e.currentSpeed, dt);
    else if (d < 235) move(e, e.a + Math.PI, e.currentSpeed * .65, dt);

    if (e.cool <= 0 && d < 720) {
      prepare(e, "spit", .65, 0, {
        tx: g.p.x + g.p.vx * .3,
        ty: g.p.y + g.p.vy * .3
      });
    }
  },

  bomb(e, g, dt) {
    if (dist(e, g.p) < 106) prepare(e, "bomb", .82, 118);
    else move(e, e.a, e.currentSpeed, dt);
  },

  charge(e, g, dt) {
    if (e.cool <= 0 && dist(e, g.p) < 550) {
      prepare(e, "charge", .82, 0, { length: 300 });
    } else if (dist(e, g.p) > 125) {
      move(e, e.a, e.currentSpeed, dt);
    }
  },

  heal(e, g, dt) {
    const d = dist(e, g.p);
    if (d > 360) move(e, e.a, e.currentSpeed, dt);
    else if (d < 245) move(e, e.a + Math.PI, e.currentSpeed * .5, dt);
    if (e.cool <= 0) prepare(e, "heal", 1.0, 200);
  },

  boss(e, g, dt) {
    const d = dist(e, g.p);
    const rage = e.hp < e.maxHp * .5;
    if (d > 145) move(e, e.a, e.currentSpeed * (rage ? 1.35 : 1), dt);

    if (e.cool <= 0) {
      if (d < 190) prepare(e, "slam", rage ? .66 : .9, 165);
      else prepare(e, "fan", rage ? .65 : .85, 0);
    }
  }
};

function releaseAction(e, a, g) {
  const p = g.p;
  e.action = null;
  e.cool = 1.3;

  if (a.kind === "melee") {
    const angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (dist(e, p) < a.r + p.r && Math.abs(angleDiff(angle, a.a)) < .9) {
      g.hurt(e.damage, e);
    }
    g.effects.push({
      kind: "slash", x: e.x, y: e.y, a: a.a,
      r: a.r, life: .15, max: .15, color: "#e1bf93"
    });
    e.cool = e.type === "runner" ? .8 : 1.1;
  }

  if (a.kind === "slam" || a.kind === "bomb") {
    g.ring(a.x, a.y, a.r, "#ffb17e");
    g.spark(a.x, a.y, "#c59f78", 24);
    g.shake = 6;
    if (dist(a, p) < a.r + p.r) g.hurt(e.damage, e);

    if (a.kind === "bomb") {
      e.dead = true; // 自爆不视为玩家击杀。
    }
    e.cool = 2;
  }

  if (a.kind === "charge") {
    e.charge = { a: a.a, left: .5, hit: false, speed: 600 };
    e.cool = 3.3;
  }

  if (a.kind === "spit") {
    const angle = Math.atan2(a.ty - e.y, a.tx - e.x);
    g.enemyBullet(e.x, e.y, angle, 270, e.damage, {
      acid: true,
      life: clamp(Math.hypot(a.tx - e.x, a.ty - e.y) / 270, .35, 2.5)
    });
    e.cool = 2.7;
  }

  if (a.kind === "heal") {
    for (const other of g.enemies) {
      if (other.dead || dist(e, other) > a.r) continue;
      const ratio = other.type === "boss" ? .02 : .07;
      other.hp = Math.min(other.maxHp, other.hp + other.maxHp * ratio);
    }
    g.ring(e.x, e.y, a.r, "#8acfa4");
    e.cool = 4;
  }

  if (a.kind === "fan") {
    const rage = e.hp < e.maxHp * .5;
    const count = rage ? 11 : 7;
    for (let i = 0; i < count; i++) {
      g.enemyBullet(e.x, e.y,
        a.a + (i - (count - 1) / 2) * .17,
        rage ? 255 : 205, e.damage * .7);
    }
    e.cool = rage ? 1.5 : 2.3;
  }
}

export function updateEnemies(g, dt) {
  for (const e of g.enemies) {
    e.px = e.x;
    e.py = e.y;
  }
  g.grid.rebuild(g.enemies);

  for (const e of g.enemies.slice()) {
    if (e.dead) continue;

    e.hit = Math.max(0, e.hit - dt);
    e.slow = Math.max(0, e.slow - dt);
    e.cool -= dt;

    if (e.burn > 0) {
      e.burn -= dt;
      g.hit(e, e.burnDps * dt, "dot");
      if (e.dead) continue;
    }

    const targetAngle = Math.atan2(g.p.y - e.y, g.p.x - e.x);
    e.currentSpeed = e.speed * g.event.speed * (e.slow > 0 ? .45 : 1);

    if (e.charge) {
      const charge = e.charge;
      const x0 = e.x, y0 = e.y;
      move(e, charge.a, charge.speed, dt);
      e.a = charge.a;
      charge.left -= dt;

      // 相对运动的冲锋碰撞。
      const hit = segmentHit(
        x0 - g.p.px, y0 - g.p.py,
        e.x - g.p.x, e.y - g.p.y,
        0, 0, e.r + g.p.r
      );
      if (!charge.hit && Number.isFinite(hit)) {
        charge.hit = true;
        g.hurt(e.damage, e);
      }

      if (charge.left <= 0) e.charge = null;
    } else if (e.action) {
      e.action.left -= dt;
      if (e.action.left <= 0) releaseAction(e, e.action, g);
    } else {
      if (e.type === "shield") {
        // 真正的慢转向：玩家可以绕到盾牌侧后方。
        const turn = clamp(angleDiff(targetAngle, e.a), -dt * 1.1, dt * 1.1);
        e.a += turn;
      } else {
        e.a = targetAngle;
      }

      const behavior = BEHAVIORS[MONSTERS[e.type].ai];
      behavior?.(e, g, dt);

      // 只在非蓄力、非冲锋期间分离，避免预警区域漂移。
      if (!e.action) {
        for (const other of g.grid.near(e.x, e.y, e.r + 50)) {
          if (other === e || other.dead) continue;
          const dx = e.x - other.x, dy = e.y - other.y;
          const d = Math.hypot(dx, dy);
          const overlap = (e.r + other.r) * .8 - d;
          if (overlap > 0 && d > .01) {
            const push = Math.min(overlap, 40 * dt);
            e.x += dx / d * push;
            e.y += dy / d * push;
          }
        }
      }
    }

    e.x = clamp(e.x, 12, W - 12);
    e.y = clamp(e.y, 12, H - 12);
    e.vx = (e.x - e.px) / dt;
    e.vy = (e.y - e.py) / dt;
    e.anim += dt * (e.type === "runner" || e.type === "mite" ? 1.5 : 1);
  }
}
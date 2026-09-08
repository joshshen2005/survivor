import { W, H, TAU, HEROES, MONSTERS, clamp, rand } from "./data.js";

const FILTERS = {
  walker: "none",
  runner: "hue-rotate(25deg) saturate(.8)",
  brute: "sepia(.45) saturate(.7)",
  spitter: "hue-rotate(50deg) saturate(1.5)",
  bomber: "sepia(.5) saturate(1.5)",
  shield: "saturate(.35)",
  charger: "sepia(.6) saturate(1.2)",
  shaman: "hue-rotate(95deg)",
  splitter: "hue-rotate(205deg)",
  mite: "hue-rotate(205deg) brightness(1.15)",
  boss: "sepia(.8) saturate(1.8)"
};

function ellipse(c, x, y, rx, ry, color) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fill();
}

function circle(c, x, y, r, fill, stroke) {
  c.beginPath();
  c.arc(x, y, Math.max(.01, r), 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}

function text(c, value, x, y, size, color) {
  c.font = `600 ${size}px system-ui`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = color;
  c.fillText(value, x, y);
}

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.assets = assets;
    this.view = { s: 1, x: 0, y: 0 };
    this.stick = { active: false, dx: 0, dy: 0, x: 95, y: H - 100 };

    this.floor = document.createElement("canvas");
    this.floor.width = W;
    this.floor.height = H;
    this.makeFloor();

    const observer = new ResizeObserver(() => this.resize());
    observer.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const s = Math.min(rect.width / W, rect.height / H);
    this.view = {
      s, x: (rect.width - W * s) / 2,
      y: (rect.height - H * s) / 2, dpr
    };
  }

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    const v = this.view;
    return {
      x: (event.clientX - rect.left - v.x) / v.s,
      y: (event.clientY - rect.top - v.y) / v.s
    };
  }

  makeFloor() {
    const c = this.floor.getContext("2d");
    c.fillStyle = "#242b2c";
    c.fillRect(0, 0, W, H);

    // 只生成一次地面纹理。
    for (let i = 0; i < 10000; i++) {
      const alpha = rand(.02, .09);
      c.fillStyle = Math.random() < .5
        ? `rgba(0,0,0,${alpha})`
        : `rgba(190,196,181,${alpha})`;
      c.fillRect(rand(0, W), rand(0, H), rand(1, 3), rand(1, 3));
    }

    c.fillStyle = "#171f20";
    c.fillRect(0, 250, W, 190);
    c.strokeStyle = "#c4ba812a";
    c.lineWidth = 4;
    c.setLineDash([35, 27]);
    c.beginPath();
    c.moveTo(0, 345); c.lineTo(W, 345);
    c.stroke();
    c.setLineDash([]);

    c.strokeStyle = "#080e1255";
    c.lineWidth = 2;
    for (let i = 0; i < 65; i++) {
      const x = rand(0, W), y = rand(0, H);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + rand(-18, 18), y + rand(5, 22));
      c.lineTo(x + rand(-25, 25), y + rand(22, 45));
      c.stroke();
    }

    // 周边装饰只贴边，不伪装成可碰撞障碍。
    for (let x = 25; x < W; x += 90) {
      c.fillStyle = "#10181c";
      c.fillRect(x, 0, 65, 10);
      c.fillRect(x, H - 10, 65, 10);
      c.fillStyle = "#a89c583b";
      c.fillRect(x + 4, 2, 18, 4);
      c.fillRect(x + 32, H - 7, 18, 4);
    }
  }

  glow(c, x, y, radius, color) {
    const grad = c.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = grad;
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  image(c, key, time, width, filter = "none", pivot = .5) {
    const frame = this.assets.frame(key, time, filter);
    if (!frame) return false;

    const height = frame.height / frame.width * width;
    c.drawImage(frame, -width * pivot, -height * .5, width, height);
    return true;
  }

  // 素材失败时的有机形体备用绘制，不冒充正式美术。
  fallback(c, e, player) {
    const r = e.r;
    const gait = Math.sin(e.anim * 12) * r * .15;
    c.lineCap = "round";

    c.strokeStyle = player ? "#35434b" : "#465044";
    c.lineWidth = r * .5;
    c.beginPath();
    c.moveTo(-r * .3, -r * .42);
    c.lineTo(-r * .95 + gait, -r * .5);
    c.moveTo(-r * .3, r * .42);
    c.lineTo(-r * .95 - gait, r * .5);
    c.stroke();

    ellipse(c, -r * .1, 0, r * .8, r * .78,
      player ? "#788374" : "#71806a");

    c.strokeStyle = player ? "#c9a887" : "#9baf89";
    c.lineWidth = r * .32;
    c.beginPath();
    c.moveTo(0, -r * .62); c.lineTo(r * .95, -r * .6);
    c.moveTo(0, r * .62); c.lineTo(r, r * .6);
    c.stroke();

    ellipse(c, r * .33, 0, r * .49, r * .45,
      player ? "#cdb194" : "#a5b993");
    ellipse(c, r * .18, 0, r * .34, r * .46,
      player ? "#463b31" : "#475046");

    if (player) {
      c.fillStyle = "#252b2e";
      c.fillRect(r * .65, -4, r * 1.45, 8);
      c.fillStyle = "#aab2b0";
      c.fillRect(r * 1.65, -3, r * .45, 6);
    } else {
      c.fillStyle = "#b87963";
      c.fillRect(r * .61, -r * .23, 3, 3);
      c.fillRect(r * .61, r * .13, 3, 3);
      c.strokeStyle = "#394332";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-r * .5, -r * .4);
      c.lineTo(r * .1, r * .5);
      c.stroke();
    }
  }

  actor(c, e, player = false, alpha = 1) {
    const r = e.r;
    const moving = Math.hypot(e.vx || 0, e.vy || 0) > 5;
    c.save();
    c.globalAlpha *= alpha;
    c.translate(e.x, e.y);

    ellipse(c, -3, 8, r * 1.2, r * .72, "#00000060");

    if (player) {
      const hero = HEROES[e.hero];
      c.lineWidth = 1.5;
      circle(c, 0, 0, r + 8, null, hero.color + "66");

      if (e.shield > 0) {
        circle(c, 0, 0, r + 14, "#addbff0b", "#aedbff88");
      }

      // 脚朝移动方向，躯干朝瞄准方向。
      c.save();
      c.rotate(e.moveA || 0);
      this.image(c, moving ? "feet_run" : "feet_idle", e.anim, 46);
      c.restore();

      c.rotate(e.a);
      const state = e.muzzle > 0 ? "shoot" : moving ? "move" : "idle";
      const key = `player_${hero.weapon}_${state}`;
      const ok = this.image(c, key, e.anim, 72, "none", .36);
      if (!ok) this.fallback(c, e, true);

      if (e.muzzle > 0) {
        c.globalCompositeOperation = "lighter";
        this.glow(c, 43, 0, 33, "#ffca7144");
        c.fillStyle = "#ffe4a1";
        c.beginPath();
        c.moveTo(39, -6); c.lineTo(60, 0);
        c.lineTo(39, 6); c.lineTo(44, 0);
        c.fill();
      }
    } else {
      if (e.elite) {
        c.lineWidth = 2;
        circle(c, 0, 0, r + 8, null, "#d8b878aa");
      }

      c.rotate(e.a);
      const state = e.action ? "attack" : moving ? "move" : "idle";
      const ok = this.image(
        c, "zombie_" + state, e.anim,
        r * 3.3, FILTERS[e.type] || "none", .43
      );
      if (!ok) this.fallback(c, e, false);

      // 特殊种类增加不同轮廓，不只靠颜色分辨。
      if (e.type === "shield") {
        c.fillStyle = "#4e626a";
        c.strokeStyle = "#aab6ae";
        c.lineWidth = 2;
        c.fillRect(r * .9, -r, r * .32, r * 2);
        c.strokeRect(r * .9, -r, r * .32, r * 2);
        c.fillStyle = "#d0b16c";
        c.fillRect(r * .95, -r * .32, r * .2, r * .64);
      }

      if (e.type === "bomber" || e.type === "spitter") {
        for (const y of [-r * .45, r * .4]) {
          ellipse(c, -r * .32, y, r * .4, r * .32,
            e.type === "bomber" ? "#c39c6688" : "#a2bc6388");
        }
      }

      if (e.type === "splitter" || e.type === "shaman") {
        for (let i = 0; i < 4; i++) {
          const a = i * TAU / 4;
          circle(c, Math.cos(a) * r * .75, Math.sin(a) * r * .65,
            r * .23, e.type === "shaman" ? "#89cbb1" : "#af8ab5");
        }
      }

      if (e.type === "charger" || e.type === "boss") {
        c.fillStyle = "#d1c0a1";
        for (const side of [-1, 1]) {
          c.beginPath();
          c.moveTo(r * .3, side * r * .4);
          c.lineTo(r * 1.05, side * r * .85);
          c.lineTo(r * .62, side * r * .25);
          c.fill();
        }
      }

      if (e.hit > 0) {
        c.globalAlpha *= e.hit / .075 * .5;
        ellipse(c, 0, 0, r * .8, r * .7, "#fff3d4");
      }
    }

    c.restore();

    if (!player && e.hp < e.maxHp) {
      c.fillStyle = "#081013";
      c.fillRect(e.x - r, e.y - r - 17, r * 2, 4);
      c.fillStyle = e.type === "boss" ? "#d48379" : e.elite ? "#cdb278" : "#8caa8d";
      c.fillRect(e.x - r, e.y - r - 17,
        r * 2 * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }

  telegraph(c, e) {
    const a = e.action;
    if (!a) return;
    const progress = 1 - a.left / a.total;

    c.save();
    c.translate(a.x, a.y);
    c.lineWidth = 2;

    if (a.kind === "charge") {
      c.rotate(a.a);
      c.fillStyle = "#e8906828";
      c.strokeStyle = "#edaa7b";
      c.fillRect(0, -e.r, a.length, e.r * 2);
      c.strokeRect(0, -e.r, a.length, e.r * 2);
      c.fillStyle = "#edb57c44";
      c.fillRect(0, -e.r, a.length * progress, e.r * 2);
    } else if (a.kind === "melee") {
      c.rotate(a.a);
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, a.r, -.9, .9);
      c.closePath();
      c.fillStyle = "#ffb77b25";
      c.strokeStyle = "#ddb582aa";
      c.fill(); c.stroke();
    } else if (a.r > 0) {
      const safe = a.kind === "heal";
      circle(c, 0, 0, a.r, safe ? "#8acbaa13" : "#e68c691a",
        safe ? "#8acbaa88" : "#e5aa77");
      circle(c, 0, 0, a.r * progress, safe ? "#8acbaa22" : "#e68c6933");
    } else {
      c.rotate(a.a);
      c.strokeStyle = a.kind === "spit" ? "#bfd57d" : "#dc9a80";
      c.setLineDash([8, 10]);
      if (a.kind === "fan") {
        for (const angle of [-.6, 0, .6]) {
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(Math.cos(angle) * 260, Math.sin(angle) * 260);
          c.stroke();
        }
      } else {
        c.beginPath(); c.moveTo(0, 0); c.lineTo(260, 0); c.stroke();
      }
    }
    c.restore();
  }

  preview(canvas, id, player) {
    const c = canvas.getContext("2d");
    canvas.width = 240;
    canvas.height = 150;
    c.clearRect(0, 0, 240, 150);
    c.save();
    c.translate(120, 76);
    c.scale(1.45, 1.45);

    const e = player
      ? {
          x: 0, y: 0, hero: id, r: 15, a: -.3, moveA: 0,
          anim: .1, vx: 0, vy: 0, shield: 0, muzzle: 0
        }
      : {
          x: 0, y: 0, type: id, r: Math.min(25, MONSTERS[id].r),
          a: -.3, anim: .2, vx: 0, vy: 0,
          hp: 1, maxHp: 1, hit: 0
        };

    this.actor(c, e, player);
    c.restore();
  }

  draw(g) {
    const c = this.ctx, v = this.view;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#090e14";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);

    c.setTransform(
      v.dpr * v.s, 0, 0, v.dpr * v.s,
      v.x * v.dpr, v.y * v.dpr
    );
    c.save();
    c.beginPath(); c.rect(0, 0, W, H); c.clip();

    if (g.mode === "run" && g.shake > 0) {
      c.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake));
    }

    c.drawImage(this.floor, 0, 0);

    for (const d of g.decals) {
      c.save();
      c.translate(d.x, d.y); c.rotate(d.a);
      c.globalAlpha = Math.min(.5, d.life / 8);
      ellipse(c, 0, 0, d.r * 1.25, d.r * .6, "#422c26");
      ellipse(c, d.r * .7, 3, d.r * .3, d.r * .22, "#352721");
      c.restore();
    }

    for (const z of g.zones) {
      c.save();
      c.globalAlpha = Math.min(1, z.life);
      const safe = z.kind === "medic";
      circle(c, z.x, z.y, z.r,
        safe ? "#6fc9a023" : "#b0bd4f33",
        safe ? "#96d5ad77" : "#c3d26a88");
      if (safe) {
        c.fillStyle = "#b8e5be";
        c.fillRect(z.x - 3, z.y - 12, 6, 24);
        c.fillRect(z.x - 12, z.y - 3, 24, 6);
      } else {
        for (let i = 0; i < 5; i++) {
          const a = i * TAU / 5 + g.time * .2;
          circle(c, z.x + Math.cos(a) * z.r * .5,
            z.y + Math.sin(a) * z.r * .5,
            3 + Math.sin(g.time * 3 + i), "#c5cf7555");
        }
      }
      c.restore();
    }

    for (const warning of g.warnings) {
      c.lineWidth = 2;
      circle(c, warning.x, warning.y, 26, "#d98d6c16", "#dca27e");
      circle(c, warning.x, warning.y,
        26 * clamp(1 - warning.life / warning.max, 0, 1), "#dca27e33");
      text(c, "!", warning.x, warning.y, 20, "#f0c194");
    }

    for (const e of g.enemies) this.telegraph(c, e);

    for (const fx of g.effects) {
      if (fx.kind !== "ghost") continue;
      c.save();
      c.globalAlpha = fx.life / fx.max * .22;
      ellipse(c, fx.x, fx.y, 17, 13, fx.color);
      c.restore();
    }

    const actors = g.enemies.filter(e => !e.dead)
      .map(e => ({ e, player: false }))
      .concat([{ e: g.p, player: true }])
      .sort((a, b) => a.e.y - b.e.y);

    for (const { e, player } of actors) {
      const alpha = player && e.inv > 0
        ? .55 + Math.sin(g.time * 45) * .25 : 1;
      this.actor(c, e, player, alpha);

      if (!player && e.burn > 0) {
        this.glow(c, e.x, e.y, e.r * 2, "#d98a4926");
        for (let i = 0; i < 3; i++) {
          ellipse(c, e.x - 9 + i * 9,
            e.y - 8 - Math.sin(g.time * 12 + i) * 5,
            3, 6, i === 1 ? "#e7be70" : "#c67b42");
        }
      }
    }

    c.lineCap = "round";
    c.save();
    c.globalCompositeOperation = "lighter";

    for (const b of g.bullets) {
      const len = Math.hypot(b.vx, b.vy);
      c.lineWidth = b.crit ? 3 : 2;
      c.strokeStyle = b.crit ? "#ffd78c" : "#ddcfaa";
      c.beginPath();
      c.moveTo(b.x - b.vx / len * 19, b.y - b.vy / len * 19);
      c.lineTo(b.x, b.y);
      c.stroke();
    }

    for (const b of g.hostile) {
      circle(c, b.x, b.y, b.r,
        b.acid ? "#b6d36e" : "#df9c7e", "#f7dfae");
    }

    for (const fx of g.effects) {
      if (fx.kind === "ghost") continue;
      c.globalAlpha = fx.life / fx.max;
      c.strokeStyle = fx.color;
      c.lineWidth = 2.5;

      if (fx.kind === "ring") {
        circle(c, fx.x, fx.y,
          fx.r * (1 - fx.life / fx.max * .7), null, fx.color);
      } else if (fx.kind === "arc") {
        c.beginPath();
        c.moveTo(fx.x, fx.y);
        c.lineTo((fx.x + fx.tx) / 2 + Math.sin(fx.life * 100) * 8,
          (fx.y + fx.ty) / 2 + 7);
        c.lineTo(fx.tx, fx.ty);
        c.stroke();
      } else if (fx.kind === "slash") {
        c.beginPath();
        c.arc(fx.x, fx.y, fx.r * .85, fx.a - .8, fx.a + .8);
        c.stroke();
      }
    }

    for (const q of g.particles) {
      c.globalAlpha = q.life / q.max;
      c.fillStyle = q.color;
      c.fillRect(q.x, q.y, q.size * (q.kind === "shell" ? 2 : 1), q.size);
    }
    c.restore();

    // 边缘环境照明与暗角；不遮住攻击预警。
    this.glow(c, 100, 25, 250, "#88b7bc13");
    this.glow(c, W - 120, H - 20, 260, "#dca97112");
    const dark = c.createRadialGradient(W / 2, H / 2, 150, W / 2, H / 2, 700);
    dark.addColorStop(0, "#00000000");
    dark.addColorStop(1, "#02060965");
    c.fillStyle = dark;
    c.fillRect(0, 0, W, H);

    if (g.input.manual) {
      c.strokeStyle = "#f0dcb0";
      c.lineWidth = 1;
      const { x, y } = g.input.aim;
      circle(c, x, y, 10, null, "#f0dcb0");
      c.beginPath();
      c.moveTo(x - 16, y); c.lineTo(x - 7, y);
      c.moveTo(x + 7, y); c.lineTo(x + 16, y);
      c.moveTo(x, y - 16); c.lineTo(x, y - 7);
      c.moveTo(x, y + 7); c.lineTo(x, y + 16);
      c.stroke();
    }

    const s = this.stick;
    c.save();
    c.globalAlpha = s.active ? .65 : .18;
    circle(c, s.x, s.y, 49, "#aec5cf12", "#afc8d5");
    circle(c, s.x + s.dx * 33, s.y + s.dy * 33, 20, "#b9cfd877");
    c.restore();

    if (g.p.hp < g.p.maxHp * .25) {
      c.strokeStyle = `rgba(202,83,70,${.3 + Math.sin(g.time * 6) * .1})`;
      c.lineWidth = 8;
      c.strokeRect(4, 4, W - 8, H - 8);
    }

    const boss = g.enemies.find(e => e.type === "boss" && !e.dead);
    if (boss) {
      c.fillStyle = "#11191de8";
      c.fillRect(W / 2 - 190, 52, 380, 29);
      text(c, "灾厄暴君" + (boss.hp < boss.maxHp * .5 ? " · 狂暴" : ""),
        W / 2, 62, 12, "#e2b3a0");
      c.fillStyle = "#57362f";
      c.fillRect(W / 2 - 180, 72, 360, 4);
      c.fillStyle = "#d38b77";
      c.fillRect(W / 2 - 180, 72, 360 * boss.hp / boss.maxHp, 4);
    }

    c.restore();
  }
}
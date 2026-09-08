import {
  W, H, TAU, HEROES, MONSTERS, EVENTS, SHOP, RELICS,
  difficulty, clamp, rand, dist
} from "./data.js";

import {
  SpatialGrid, shootVolley, updateBullets, segmentHit
} from "./combat.js";

import { updateEnemies } from "./behaviors.js";

export class Game {
  constructor() {
    this.grid = new SpatialGrid();
    this.input = {
      x: 0, y: 0, manual: false,
      aim: { x: W / 2 + 100, y: H / 2 }
    };
    this.save = { best: 0, kills: {} };

    try {
      const value = JSON.parse(localStorage.getItem("survivor_modular_v3"));
      if (value && typeof value === "object") {
        this.save.best = Number(value.best) || 0;
        this.save.kills = value.kills || {};
      }
    } catch {}

    this.soundOn = false;
    this.audio = null;
    this.reset("assault");
    this.mode = "menu";
  }

  persist() {
    try {
      localStorage.setItem("survivor_modular_v3", JSON.stringify(this.save));
    } catch {}
  }

  sound(frequency, duration = .08, volume = .025) {
    if (!this.soundOn || !this.audio) return;
    const t = this.audio.currentTime;
    const o = this.audio.createOscillator();
    const gain = this.audio.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(frequency, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * .45), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(gain);
    gain.connect(this.audio.destination);
    o.start(t);
    o.stop(t + duration);
  }

  reset(hero) {
    const h = HEROES[hero];

    this.p = {
      hero, x: W / 2, y: H / 2, px: W / 2, py: H / 2,
      vx: 0, vy: 0, r: 15, a: 0, anim: 0,
      hp: h.hp, maxHp: h.hp, damage: h.damage,
      rate: h.rate, speed: h.speed, armor: h.armor,
      regen: h.regen, crit: h.crit,
      coin: 35, xp: 0, level: 1, need: 45,
      shots: 1, pierce: 1, burn: 0, ice: 0, chain: 0,
      blast: 0, leech: 0, gold: 1, revive: 0,
      shield: 0, inv: 0, buff: 0, muzzle: 0,
      skillCD: 0, cool: 1, skillPower: 1,
      dash: 0, dashCD: 0, dashMax: 3.2, dashA: 0,
      moveA: 0
    };

    this.time = 0;
    this.kills = 0;
    this.score = 0;
    this.totalCoins = 0;
    this.nextId = 1;
    this.enemies = [];
    this.bullets = [];
    this.hostile = [];
    this.warnings = [];
    this.zones = [];
    this.particles = [];
    this.effects = [];
    this.decals = [];
    this.blastQueue = [];
    this.shopLevels = SHOP.map(() => 0);
    this.relics = {};
    this.pending = 0;
    this.choices = [];
    this.event = EVENTS[0];
    this.eventIndex = 0;
    this.nextBoss = 120;
    this.budget = 0;
    this.spawnCD = .3;
    this.shootCD = 0;
    this.shake = 0;
    this.message = "四面来敌 · 注意攻击预警 · Shift 闪避";
    this.messageLife = 5;
    this.mode = "run";
  }

  announce(text, life = 3) {
    this.message = text;
    this.messageLife = life;
  }

  heal(value) {
    this.p.hp = Math.min(this.p.maxHp, this.p.hp + value);
  }

  spark(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), v = rand(30, 190);
      const life = rand(.18, .55);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life, max: life, color, size: rand(1.5, 4)
      });
    }
  }

  ring(x, y, r, color) {
    this.effects.push({
      kind: "ring", x, y, r, color, life: .5, max: .5
    });
  }

  bullet(x, y, a, damage, pierce = 1, crit = false) {
    if (this.bullets.length >= 650) return;
    this.bullets.push({
      x, y, vx: Math.cos(a) * 920, vy: Math.sin(a) * 920,
      damage, life: 1.4, left: pierce, crit, hits: new Set()
    });
  }

  enemyBullet(x, y, a, speed, damage, options = {}) {
    if (this.hostile.length >= 220) return;
    this.hostile.push({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      damage, r: 6, life: 5, acid: false, ...options
    });
  }

  cost(index) {
    const item = SHOP[index];
    return Math.floor(item.base * item.growth ** this.shopLevels[index]);
  }

  buy(index) {
    if (this.mode !== "run") return;
    const item = SHOP[index], cost = this.cost(index);

    if (!item.valid(this.p)) return;
    if (this.p.coin < cost) {
      this.announce("金币不足", 1);
      return;
    }

    this.p.coin -= cost;
    this.shopLevels[index]++;
    item.apply(this.p);
    this.spark(this.p.x, this.p.y, "#e7c58f", 16);
    this.sound(700, .12);
  }

  useSkill() {
    if (this.mode !== "run" || this.p.skillCD > 0) return;
    const hero = HEROES[this.p.hero];
    this.p.skillCD = hero.cd * this.p.cool;
    hero.cast(this);
    this.announce(hero.skill, 1.5);
    this.spark(this.p.x, this.p.y, hero.color, 24);
    this.sound(600, .22);
  }

  dash() {
    const p = this.p;
    if (this.mode !== "run" || p.dashCD > 0) return;

    const len = Math.hypot(this.input.x, this.input.y);
    p.dashA = len > .05
      ? Math.atan2(this.input.y, this.input.x)
      : p.moveA;

    p.dash = .18;
    p.inv = Math.max(p.inv, .23);
    p.dashCD = p.dashMax;
    this.sound(240, .12);
  }

  hurt(amount, source) {
    if (this.mode !== "run" || this.p.inv > 0) return;
    const p = this.p;

    let value = amount * (1 - p.armor);
    const blocked = Math.min(p.shield, value);
    p.shield -= blocked;
    value -= blocked;
    p.hp -= value;
    p.inv = .24;
    this.shake = 5;

    this.spark(p.x, p.y, blocked >= amount ? "#b2e4ff" : "#d9847b", 12);
    this.sound(80, .13, .04);

    if (p.hp <= 0) {
      if (p.revive > 0) {
        p.revive--;
        p.hp = p.maxHp * .5;
        p.inv = 2;
        this.area(p.x, p.y, 210, p.damage * 3, true);
        this.announce("不死火种触发", 3);
      } else {
        p.hp = 0;
        this.finish();
      }
    }
  }

  hit(enemy, amount, kind = "skill", bullet = null) {
    if (enemy.dead) return;

    if (enemy.type === "shield" && kind === "bullet" && bullet) {
      // 子弹速度与盾朝向相反，说明打中盾正面。
      const incoming = Math.atan2(bullet.vy, bullet.vx);
      if (Math.cos(incoming - enemy.a) < -.35) amount *= .3;
    }

    enemy.hp -= amount;
    enemy.hit = .075;
    if (enemy.hp <= 0) this.kill(enemy);
  }

  area(x, y, radius, damage, knock = false) {
    for (const e of this.enemies.slice()) {
      if (e.dead || dist({ x, y }, e) > radius + e.r) continue;

      this.hit(e, damage);
      if (knock && !e.dead) {
        // 控制打断非 Boss 的蓄力，预警随之取消。
        if (e.type !== "boss") {
          e.action = null;
          e.charge = null;
          e.cool = 1;
          const a = Math.atan2(e.y - y, e.x - x);
          e.x = clamp(e.x + Math.cos(a) * 75, 12, W - 12);
          e.y = clamp(e.y + Math.sin(a) * 75, 12, H - 12);
        }
        e.slow = 2;
      }
    }
  }

  kill(e) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this.save.kills[e.type] = (Number(this.save.kills[e.type]) || 0) + 1;

    const reward = Math.max(1, Math.round(e.coin * this.p.gold * this.event.gold));
    this.p.coin += reward;
    this.totalCoins += reward;
    this.p.xp += e.xp;
    this.heal(this.p.leech);
    this.spark(e.x, e.y, "#94785e", e.type === "boss" ? 35 : 10);

    this.decals.push({
      x: e.x, y: e.y, r: e.r * rand(.7, 1.2),
      a: rand(0, TAU), life: 30
    });

    if (this.p.blast) {
      // 下一帧结算，防止连续爆炸造成递归调用。
      this.blastQueue.push({
        x: e.x, y: e.y, r: 72,
        damage: this.p.damage * .45 * this.p.blast
      });
    }

    if (e.type === "splitter") {
      for (let i = 0; i < 3; i++) {
        const a = i * TAU / 3;
        this.queueSpawn("mite",
          e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, .4);
      }
    }

    if (e.type === "boss") {
      this.pending++;
      this.heal(15);
      this.announce("暴君击杀 · 获得额外强化", 4);
      this.persist();
    }

    while (this.p.xp >= this.p.need) {
      this.p.xp -= this.p.need;
      this.p.level++;
      this.p.need = Math.round(45 * this.p.level ** 1.2);
      this.pending++;
    }
  }

  rollDraft() {
    const pool = RELICS.filter(r =>
      (this.relics[r.id] || 0) < r.max &&
      (!r.valid || r.valid(this))
    );
    this.choices = [];
    while (this.choices.length < 3 && pool.length) {
      const index = Math.floor(Math.random() * pool.length);
      this.choices.push(pool.splice(index, 1)[0]);
    }
    this.mode = "draft";
  }

  pick(index) {
    if (this.mode !== "draft") return;
    const relic = this.choices[index];
    if (!relic) return;
    this.relics[relic.id] = (this.relics[relic.id] || 0) + 1;
    relic.apply(this);
    this.pending--;
    if (this.pending > 0) this.rollDraft();
    else this.mode = "run";
  }

  queueSpawn(type, x, y, delay = .95) {
    if (this.warnings.length >= 24) return false;
    this.warnings.push({ type, x, y, life: delay, max: delay });
    return true;
  }

  edgeSpawn(type) {
    for (let tries = 0; tries < 16; tries++) {
      const side = Math.floor(Math.random() * 4);
      const point = side === 0 ? { x: 24, y: rand(30, H - 30) }
        : side === 1 ? { x: W - 24, y: rand(30, H - 30) }
        : side === 2 ? { x: rand(30, W - 30), y: 24 }
        : { x: rand(30, W - 30), y: H - 24 };

      if (dist(this.p, point) > 285) {
        return this.queueSpawn(type, point.x, point.y, 1);
      }
    }
    return false;
  }

  spawn(warning) {
    const d = difficulty(this.time);
    const m = MONSTERS[warning.type];
    const elite = warning.type !== "boss" && warning.type !== "mite" &&
      Math.random() < d.elite;

    const maxHp = m.hp * d.hp * (elite ? 1.8 : 1);
    this.enemies.push({
      id: this.nextId++, type: warning.type,
      x: warning.x, y: warning.y, px: warning.x, py: warning.y,
      vx: 0, vy: 0, a: 0, anim: rand(0, 1),
      r: m.r * (elite ? 1.13 : 1),
      hp: maxHp, maxHp,
      speed: m.speed * d.speed * (elite ? 1.1 : 1),
      damage: m.damage * d.damage * (elite ? 1.2 : 1),
      coin: m.coin * (elite ? 2.2 : 1), xp: m.xp * (elite ? 2 : 1),
      elite, cool: .6, action: null, charge: null,
      hit: 0, slow: 0, burn: 0, burnDps: 0, dead: false
    });
  }

  director(dt) {
    const d = difficulty(this.time);
    const eventIndex = Math.floor(this.time / 45);

    if (eventIndex !== this.eventIndex) {
      this.eventIndex = eventIndex;
      this.event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
      this.announce(this.event.name, 3);
      this.persist();
    }

    // Boss 不因普通怪达到数量上限而永久漏刷。
    if (this.time >= this.nextBoss && this.warnings.length < 24) {
      if (this.edgeSpawn("boss")) {
        this.nextBoss += 120;
        this.announce("灾厄暴君正在接近", 4);
      }
    }

    const population = this.enemies.length + this.warnings.length;
    if (population < d.cap) {
      this.budget = Math.min(12, this.budget + d.budget * this.event.spawn * dt);
    }

    this.spawnCD -= dt;
    if (this.spawnCD <= 0 && population < d.cap) {
      const pool = Object.entries(MONSTERS).filter(([, m]) =>
        m.unlock <= this.time && m.cost <= this.budget
      );

      if (pool.length) {
        const [type, m] = pool[Math.floor(Math.random() * pool.length)];
        if (this.edgeSpawn(type)) this.budget -= m.cost;
      }
      this.spawnCD = .18;
    }

    for (const warning of this.warnings) warning.life -= dt;

    const remaining = [];
    for (const warning of this.warnings) {
      if (warning.life > 0) {
        remaining.push(warning);
        continue;
      }

      // 刷新倒计时结束时玩家若已经靠近，推迟生成，避免贴脸出生。
      const safeDistance = warning.type === "mite" ? 55 : 95;
      if (dist(warning, this.p) < safeDistance) {
        warning.life = .3;
        remaining.push(warning);
      } else {
        this.spawn(warning);
      }
    }
    this.warnings = remaining;
  }

  finish() {
    this.mode = "over";
    this.score = Math.floor(this.time * 2 + this.kills * 12 + this.totalCoins);
    this.save.best = Math.max(this.save.best, this.score);
    this.persist();
  }

  update(dt) {
    if (this.mode !== "run") return;
    const p = this.p;

    this.time += dt;
    this.messageLife = Math.max(0, this.messageLife - dt);
    this.shake = Math.max(0, this.shake - dt * 22);

    for (const key of ["inv", "buff", "muzzle", "skillCD", "dashCD"]) {
      p[key] = Math.max(0, p[key] - dt);
    }

    this.heal(p.regen * dt);
    p.px = p.x;
    p.py = p.y;

    let x = this.input.x, y = this.input.y;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    if (length > .05) p.moveA = Math.atan2(y, x);

    if (p.dash > 0) {
      p.dash -= dt;
      p.x += Math.cos(p.dashA) * 700 * dt;
      p.y += Math.sin(p.dashA) * 700 * dt;
      this.effects.push({
        kind: "ghost", x: p.x, y: p.y, a: p.a,
        life: .18, max: .18, color: HEROES[p.hero].color
      });
    } else {
      p.x += x * p.speed * dt;
      p.y += y * p.speed * dt;
    }

    p.x = clamp(p.x, 25, W - 25);
    p.y = clamp(p.y, 25, H - 25);
    p.vx = (p.x - p.px) / dt;
    p.vy = (p.y - p.py) / dt;
    p.anim += dt;

    this.director(dt);
    updateEnemies(this, dt);
    if (this.mode !== "run") return;

    this.shootCD -= dt;
    if (this.shootCD <= 0) {
      const fired = shootVolley(this);
      this.shootCD = fired ? 1 / (p.rate * (p.buff > 0 ? 1.7 : 1)) : 0;
    }

    updateBullets(this, dt);

    // 敌方弹丸同样采用相对运动连续碰撞。
    const kept = [];
    for (const b of this.hostile) {
      const ox = b.x, oy = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      const t = segmentHit(
        ox - p.px, oy - p.py, b.x - p.x, b.y - p.y,
        0, 0, p.r + b.r
      );
      const hit = Number.isFinite(t);

      if (hit) this.hurt(b.damage);

      if (b.life <= 0 || hit) {
        if (b.acid) {
          this.zones.push({
            kind: "acid", x: b.x, y: b.y, r: 45,
            life: 4.5, tick: .35, power: b.damage
          });
        }
      } else if (b.x > -40 && b.x < W + 40 && b.y > -40 && b.y < H + 40) {
        kept.push(b);
      }
    }
    this.hostile = kept;
    if (this.mode !== "run") return;

    const blasts = this.blastQueue;
    this.blastQueue = [];
    for (const b of blasts) {
      this.area(b.x, b.y, b.r, b.damage);
      this.ring(b.x, b.y, b.r, "#dbaa75");
    }

    for (const zone of this.zones) {
      zone.life -= dt;
      zone.tick -= dt;
      if (zone.tick > 0) continue;
      zone.tick += .5;

      if (zone.kind === "acid") {
        if (dist(zone, p) < zone.r + p.r) this.hurt(zone.power * .35);
      } else {
        if (dist(zone, p) < zone.r) this.heal(2 * zone.power);
        this.area(zone.x, zone.y, zone.r, 9 * zone.power);
      }
    }

    if (this.mode !== "run") return;

    this.zones = this.zones.filter(z => z.life > 0).slice(-70);
    this.enemies = this.enemies.filter(e => !e.dead);

    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.exp(-dt * 4);
      particle.vy *= Math.exp(-dt * 4);
    }
    this.particles = this.particles.filter(v => v.life > 0).slice(-600);

    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter(v => v.life > 0).slice(-100);

    for (const decal of this.decals) decal.life -= dt;
    this.decals = this.decals.filter(v => v.life > 0).slice(-90);

    this.score = Math.floor(this.time * 2 + this.kills * 12 + this.totalCoins);

    if (this.pending > 0) this.rollDraft();
  }
}
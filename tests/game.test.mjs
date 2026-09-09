import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../game.js';
import { difficulty, SHOP, HEROES } from '../data.js';

const fresh = (hero = 'assault') => { const g = new Game(); g.reset(hero); return g; };
const frozenState = g => JSON.stringify({
  time: g.time, p: g.p, enemies: g.enemies, bullets: g.bullets,
  hostile: g.hostile, warnings: g.warnings, zones: g.zones, budget: g.budget,
  effects: g.effects, nextBoss: g.nextBoss
});

test('整备、暂停、图鉴、强化、恢复倒计时均冻结整个战场', () => {
  for (const mode of ['shop', 'pause', 'codex', 'draft', 'resume']) {
    const g = fresh();
    g.spawn({type: 'walker', x: 100, y: 100});
    g.enemyBullet(200, 200, 0, 270, 12, {acid: true});
    g.bullet(400, 300, 0, 12);
    g.queueSpawn('runner', 24, 400);
    g.zones.push({kind: 'acid', x: 550, y: 350, r: 60, life: 4, tick: .1, power: 12});
    g.p.skillCD = 9; g.p.dashCD = 2; g.mode = mode;
    const before = frozenState(g);
    for (let i = 0; i < 600; i++) g.update(1 / 60);
    assert.equal(frozenState(g), before, mode);
  }
});

test('只允许整备购买，支持连续购买、余额检查和属性封顶', () => {
  const g = fresh(); g.p.coin = 10000;
  assert.equal(g.buy(0), false);
  g.openShop();
  for (let i = 0; i < 2; i++) {
    const before = g.p.coin, cost = g.cost(0), damage = g.p.damage;
    assert.equal(g.buy(0), true);
    assert.equal(g.p.coin, before - cost);
    assert.ok(g.p.damage > damage);
  }
  g.p.coin = 0;
  assert.equal(g.buy(0), false);
  g.p.coin = 10000; g.p.shots = 6;
  assert.equal(g.buy(2), false);
  assert.equal(g.buy(-1), false);
  assert.equal(g.buy(99), false);
  assert.equal(g.mode, 'shop');
});

test('退出手动整备立即恢复，只有暂停继续才启动三秒倒计时', () => {
  const g = fresh();
  g.openShop(); g.resume();
  assert.equal(g.mode, 'shop');
  g.closeShop();
  assert.equal(g.mode, 'run'); assert.equal(g.resumeLeft, 0);
  g.update(1 / 60); assert.ok(g.time > 0);
  g.mode = 'pause'; g.openShop(); g.closeShop();
  assert.equal(g.mode, 'pause');
  const time = g.time;
  g.resume(); assert.equal(g.mode, 'resume');
  g.updateTransition(2.9);
  assert.equal(g.mode, 'resume'); assert.equal(g.time, time);
  g.updateTransition(.11);
  assert.equal(g.mode, 'run'); assert.equal(g.time, time);
});

test('多次强化选完后直接继续战斗，不弹整备或恢复倒计时', () => {
  const g = fresh(); g.pending = 2; g.rollDraft();
  g.pick(0); assert.equal(g.pending, 1); assert.equal(g.mode, 'draft');
  g.pick(0); assert.equal(g.pending, 0); assert.equal(g.mode, 'run');
  assert.equal(g.resumeLeft, 0);
  const before = g.p.damage; g.pick(0);
  assert.equal(g.p.damage, before);
});

test('整分钟及同帧升级均不会自动打开整备', () => {
  for (const minute of [1, 2, 5, 10]) {
    const g = fresh(); g.time = minute * 60 - 1 / 120; g.pending = 1;
    g.update(1 / 60);
    assert.equal(g.mode, 'draft');
    g.pick(0); assert.equal(g.mode, 'run');
    g.update(1 / 60); assert.equal(g.mode, 'run');
    const h = fresh(); h.time = minute * 60 - 1 / 120; h.update(1 / 60);
    assert.equal(h.mode, 'run');
  }
});

test('减伤后的伤害正确抵扣护盾，受击方向/飘字/无敌期生效', () => {
  const g = fresh('bastion'); g.p.shield = 10;
  g.hurt(10, {x: g.p.x + 50, y: g.p.y});
  assert.equal(g.p.hp, HEROES.bastion.hp);
  assert.ok(Math.abs(g.p.shield - 1.6) < 1e-8);
  assert.equal(g.hitShield, true); assert.equal(g.hitDirection, 0);
  assert.match(g.effects.find(f => f.kind === 'damageText').text, /护盾/);
  assert.ok(g.damageFlash > 0 && g.p.hurtFlash > 0 && g.hitStop > 0);
  g.hurt(100); assert.equal(g.p.hp, HEROES.bastion.hp);
  g.p.inv = 0; g.hurt(10);
  assert.equal(g.hitShield, false);
  assert.ok(Math.abs(g.p.hp - (140 - 6.8)) < 1e-8);
});

test('受击停顿不推进危险，受击反馈随后衰减；复活与死亡仍正常', () => {
  const g = fresh(); g.hurt(20); const time = g.time;
  g.update(1 / 60); assert.equal(g.time, time);
  for (let i = 0; i < 70; i++) g.update(1 / 60);
  assert.equal(g.damageFlash, 0); assert.equal(g.p.hurtFlash, 0);
  g.p.revive = 1; g.hurt(10000);
  assert.equal(g.mode, 'run'); assert.equal(g.p.hp, g.p.maxHp / 2);
  g.p.inv = 0; g.hurt(10000);
  assert.equal(g.mode, 'over'); assert.equal(g.p.hp, 0);
});

test('现存或预警中的 Boss 阻止重复刷 Boss，普通刷新压力降低', () => {
  for (const spawned of [true, false]) {
    const g = fresh(); g.time = 240;
    if (spawned) g.spawn({type:'boss', x:24, y:24});
    else g.queueSpawn('boss', 24, 24, 1);
    g.director(.01);
    assert.equal(g.enemies.filter(e => e.type === 'boss').length +
      g.warnings.filter(e => e.type === 'boss').length, 1);
    assert.ok(g.budget < difficulty(240).budget * .01);
  }
});

test('所有职业升级有基础成长，商店预览等于实际结果', () => {
  for (const hero of Object.keys(HEROES)) {
    const g = fresh(hero); const damage = g.p.damage;
    g.p.xp = g.p.need;
    g.spawn({type:'walker', x:24, y:24}); g.kill(g.enemies[0]);
    assert.equal(g.p.level, 2); assert.equal(g.p.damage, damage * 1.01);
    assert.equal(g.p.maxHp, HEROES[hero].hp + 2);
    for (const item of SHOP) {
      const p = {...g.p}, expected = item.preview(p);
      item.apply(p); assert.equal(item.value(p), expected, item.name);
    }
  }
});

test('难度连续增长且速度/数量封顶；价格不会指数失控', () => {
  let previous = difficulty(0);
  for (let seconds = 1; seconds <= 1800; seconds++) {
    const d = difficulty(seconds);
    assert.ok(d.hp > previous.hp && d.damage > previous.damage);
    assert.ok(d.speed <= 1.36 && d.elite <= .22 && d.cap <= 120);
    assert.ok(d.hp - previous.hp < .2);
    previous = d;
  }
  const g = fresh();
  g.shopLevels[0] = 10; assert.ok(g.cost(0) < 4000);
  assert.ok(difficulty(900).hp > difficulty(600).hp);
});

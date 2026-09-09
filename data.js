export const W = 1100;
export const H = 700;
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const angleDiff = (a, b) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));

export const HEROES = {
  assault: {
    name: "突击手", color: "#a6c4da", weapon: "rifle",
    hp: 105, damage: 12, rate: 4.6, speed: 220,
    armor: 0, regen: 0, crit: .07, cd: 20,
    skill: "压制射击",
    desc: "稳定输出。技能：6 秒内射速 +70%、伤害 +20%。",
    cast(g) {
      g.p.buff = 6 * g.p.skillPower;
    }
  },

  ranger: {
    name: "游侠", color: "#b7a1d8", weapon: "handgun",
    hp: 82, damage: 11, rate: 4.8, speed: 247,
    armor: 0, regen: 0, crit: .17, cd: 16,
    skill: "穿云齐射",
    desc: "高移速、高暴击。技能：向周围发射 20 发穿透弹，并重置闪避。",
    cast(g) {
      g.p.dashCD = 0;
      g.p.inv = Math.max(g.p.inv, .35);
      for (let i = 0; i < 20; i++) {
        g.bullet(g.p.x, g.p.y, i * TAU / 20,
          g.p.damage * 1.6 * g.p.skillPower, 3);
      }
    }
  },

  bastion: {
    name: "堡垒", color: "#d3af79", weapon: "shotgun",
    hp: 140, damage: 14, rate: 3.7, speed: 200,
    armor: .16, regen: 0, crit: .05, cd: 22,
    skill: "震荡屏障",
    desc: "自带 16% 减伤。技能：获得护盾，击退并震伤周围敌人。",
    cast(g) {
      g.p.shield += 45 * g.p.skillPower;
      g.area(g.p.x, g.p.y, 195, g.p.damage * 4 * g.p.skillPower, true);
      g.ring(g.p.x, g.p.y, 195, "#e8c58e");
    }
  },

  medic: {
    name: "医师", color: "#9ad0b8", weapon: "rifle",
    hp: 98, damage: 10.5, rate: 4.3, speed: 222,
    armor: 0, regen: .25, crit: .06, cd: 25,
    skill: "净化领域",
    desc: "缓慢恢复生命。技能：恢复生命，放置治疗与伤害领域。",
    cast(g) {
      g.heal(24 * g.p.skillPower);
      g.zones.push({
        kind: "medic", x: g.p.x, y: g.p.y, r: 130,
        life: 7, tick: 0,
        power: g.p.skillPower
      });
    }
  }
};

function monster(name, ai, hp, speed, radius, damage, coin, unlock, cost, desc) {
  return {
    name, ai, hp, speed, r: radius, damage,
    coin, xp: coin * 3, unlock, cost, desc
  };
}

export const MONSTERS = {
  walker: monster("腐化行尸", "melee", 32, 57, 17, 13, 3, 0, 1,
    "靠近后先抬手再攻击；向侧面移动可以躲开。"),

  runner: monster("猎跑者", "melee", 25, 119, 14, 10, 4, 20, 1.25,
    "高速绕近，攻击前摇短，但生命较低。"),

  brute: monster("缝合巨汉", "slam", 150, 43, 29, 29, 12, 40, 3,
    "靠近后重击地面。离开橙红色圆形区域。"),

  spitter: monster("腐液喷吐者", "spit", 60, 54, 19, 12, 7, 50, 2,
    "远距离喷吐腐液，弹体落地后留下危险区域。"),

  bomber: monster("膨胀爆尸", "bomb", 49, 85, 22, 34, 7, 70, 1.8,
    "接近后自爆。提前击杀可拆除；自爆不奖励金币。"),

  shield: monster("锈盾卫士", "melee", 108, 47, 22, 19, 9, 90, 2.5,
    "正面子弹减伤 70%，转身较慢；绕侧或使用范围技能。"),

  charger: monster("裂颅冲锋者", "charge", 92, 66, 22, 25, 10, 110, 2.6,
    "锁定一条冲锋路线后突进，横向闪避，不要直线后退。"),

  shaman: monster("疫病祭司", "heal", 100, 45, 21, 14, 13, 140, 3,
    "蓄力后治疗附近怪物，优先击杀。"),

  splitter: monster("孢囊母体", "melee", 116, 57, 24, 20, 10, 160, 2.8,
    "死亡后生成三只寄生孢尸；注意留出脱离包围的方向。"),

  mite: monster("寄生孢尸", "melee", 16, 137, 9, 7, 1, Infinity, .4,
    "体型小、移动快，由母体分裂而来。"),

  boss: monster("灾厄暴君", "boss", 950, 43, 42, 35, 100, Infinity, 20,
    "每两分钟出现。使用扇形弹幕和范围重击，半血后狂暴。")
};

export const EVENTS = [
  { name: "常规尸潮", spawn: 1, speed: 1, gold: 1 },
  { name: "赏金围猎", spawn: 1.2, speed: 1, gold: 1.35 },
  { name: "迅疾感染", spawn: .9, speed: 1.16, gold: 1.15 },
  { name: "密集尸潮", spawn: 1.35, speed: 1, gold: 1 }
];

// 所有连续难度曲线集中在这里。
// 前期留出成型空间，8 分钟后生命增长逐步快于常规升级。
// 速度、场上数量和精英率封顶，避免靠无法躲避的攻击制造难度。
export function difficulty(seconds) {
  const m = Math.max(0, seconds / 60);
  const late = Math.max(0, m - 8);
  return {
    hp: 1 + .58 * m + .09 * m * m + .04 * late * late,
    damage: 1 + .105 * m,
    speed: 1 + Math.min(.36, .035 * m),
    budget: Math.min(8.5, 1.35 + .58 * m + .025 * m * m),
    elite: Math.min(.22, Math.max(0, (m - 2) * .022)),
    cap: Math.min(120, Math.floor(28 + m * 9))
  };
}

export const SHOP = [
  {
    name: "高能弹药", desc: "攻击 +3", base: 32, growth: .60,
    value: p => p.damage.toFixed(1),
    preview: p => (p.damage + 3).toFixed(1),
    valid: () => true,
    apply: p => p.damage += 3
  },
  {
    name: "快速供弹", desc: "射速 +10%，最高 12 发/秒", base: 38, growth: .70,
    value: p => p.rate.toFixed(1) + "/秒",
    preview: p => Math.min(12, p.rate * 1.1).toFixed(1) + "/秒",
    valid: p => p.rate < 12,
    apply: p => p.rate = Math.min(12, p.rate * 1.1)
  },
  {
    name: "多重枪管", desc: "弹道 +1，最多 6 发（分摊单发伤害）", base: 95, growth: 1.10,
    value: p => p.shots + " 发",
    preview: p => Math.min(6, p.shots + 1) + " 发",
    valid: p => p.shots < 6,
    apply: p => p.shots++
  },
  {
    name: "生命强化", desc: "生命上限 +18，恢复 30", base: 42, growth: .65,
    value: p => p.maxHp.toFixed(0),
    preview: p => (p.maxHp + 18).toFixed(0),
    valid: () => true,
    apply(p) {
      p.maxHp += 18;
      p.hp = Math.min(p.maxHp, p.hp + 30);
    }
  },
  {
    name: "动力靴", desc: "移动 +10，最高 300", base: 38, growth: .70,
    value: p => p.speed.toFixed(0),
    preview: p => Math.min(300, p.speed + 10).toFixed(0),
    valid: p => p.speed < 300,
    apply: p => p.speed = Math.min(300, p.speed + 10)
  },
  {
    name: "精准瞄具", desc: "暴击率 +5%，最高 60%", base: 48, growth: .70,
    value: p => Math.round(p.crit * 100) + "%",
    preview: p => Math.round(Math.min(.60, p.crit + .05) * 100) + "%",
    valid: p => p.crit < .60,
    apply: p => p.crit = Math.min(.60, p.crit + .05)
  }
];

export const RELICS = [
  { id: "power", name: "重型弹芯", desc: "攻击力 +18%", max: 6,
    apply: g => g.p.damage *= 1.18 },

  { id: "pierce", name: "穿甲弹", desc: "子弹额外穿透一个敌人", max: 3,
    apply: g => g.p.pierce++ },

  { id: "multi", name: "平行火控", desc: "弹道 +1，最多 6 发", max: 5,
    valid: g => g.p.shots < 6, apply: g => g.p.shots++ },

  { id: "burn", name: "燃烧弹", desc: "命中附加持续灼烧，每层提高灼烧伤害", max: 4,
    apply: g => g.p.burn++ },

  { id: "ice", name: "低温弹", desc: "每层增加 12% 概率使敌人减速", max: 4,
    apply: g => g.p.ice++ },

  { id: "chain", name: "电弧弹芯", desc: "命中有 18% 概率连锁；每层多一个目标", max: 3,
    apply: g => g.p.chain++ },

  { id: "blast", name: "死亡连爆", desc: "击杀造成小范围爆炸；每层提高爆炸伤害", max: 3,
    apply: g => g.p.blast++ },

  { id: "leech", name: "血能回收", desc: "每次击杀恢复 0.6 生命", max: 3,
    apply: g => g.p.leech += .6 },

  { id: "cool", name: "战术超频", desc: "主动技能冷却减少 12%", max: 4,
    apply: g => g.p.cool *= .88 },

  { id: "skill", name: "技能增幅", desc: "主动技能效能 +25%", max: 4,
    apply: g => g.p.skillPower += .25 },

  { id: "dash", name: "轻量外骨骼", desc: "闪避冷却减少 12%", max: 3,
    apply: g => g.p.dashMax *= .88 },

  { id: "armor", name: "复合装甲", desc: "减伤 +7 个百分点，最高 50%", max: 4,
    apply: g => g.p.armor = Math.min(.5, g.p.armor + .07) },

  { id: "gold", name: "赏金猎人", desc: "击杀金币收益 +15%", max: 4,
    apply: g => g.p.gold += .15 },

  { id: "vital", name: "强化体魄", desc: "生命上限 +20，并恢复 30", max: 5,
    apply(g) { g.p.maxHp += 20; g.heal(30); } },

  { id: "revive", name: "不死火种", desc: "本局一次复活，恢复半血并无敌 2 秒", max: 1,
    apply: g => g.p.revive++ },

  { id: "cache", name: "紧急补给", desc: "获得 65 金币，恢复 15 生命", max: 999,
    apply(g) { g.p.coin += 65; g.heal(15); } }
];

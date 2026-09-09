// 固定种子、绕圈移动与自动分配升级；用于观察成长趋势，不代表真人通关率。
import { Game } from '../game.js';
import { SHOP, difficulty } from '../data.js';
const dps = p => p.damage * p.rate * p.shots / (1 + .22 * (p.shots - 1)) * (1 + p.crit);
for (const hero of ['assault','ranger','bastion','medic']) {
  let seed = 78213;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const g = new Game(); g.reset(hero);
  let next = 120, nextShop = 0, samples = [];
  for (let i = 0; i < 60 * 900 && g.mode !== 'over'; i++) {
    if (g.mode === 'draft') {
      const order = ['multi','pierce','power','blast','leech','chain','armor','burn','vital','revive','ice','gold','cool','skill'];
      g.pick(g.choices.map((r,i)=>({i,score:order.indexOf(r.id)<0?99:order.indexOf(r.id)})).sort((a,b)=>a.score-b.score)[0].i);
    }
    // 模拟玩家每 20 秒主动按 B，而非依赖游戏自动打开整备。
    if (g.mode === 'run' && g.time >= nextShop) {
      g.openShop(); nextShop = g.time + 20;
    }
    if (g.mode === 'shop') {
      for (let n = 0; n < 80; n++) {
        const candidates = SHOP.map((item,j) => {
          const p = {...g.p}; item.apply(p);
          let gain = dps(p) / dps(g.p) - 1;
          if (j === 3) gain = (1 - g.p.hp/g.p.maxHp) * .7;
          if (j === 4) gain = g.p.speed < 250 ? .07 : .015;
          return {j, score: gain/g.cost(j), valid:item.valid(g.p)&&g.p.coin>=g.cost(j)};
        }).filter(x=>x.valid).sort((a,b)=>b.score-a.score);
        if (!candidates.length) break;
        g.buy(candidates[0].j);
      }
      g.closeShop();
    }
    const angle = g.time * .43;
    const tx = 550 + Math.cos(angle) * 330, ty = 350 + Math.sin(angle) * 210;
    let dx = tx-g.p.x, dy=ty-g.p.y;
    const len=Math.hypot(dx,dy)||1; dx/=len;dy/=len;
    g.input.x=dx; g.input.y=dy;
    if (g.enemies.some(e=>Math.hypot(e.x-g.p.x,e.y-g.p.y)<120)) g.dash();
    if (g.enemies.length>3) g.useSkill();
    g.update(1/60);
    if(g.time>=next) {
      samples.push({minute:next/60,level:g.p.level,dps:Math.round(dps(g.p)),enemyHP:+difficulty(g.time).hp.toFixed(2),hp:Math.round(g.p.hp),kills:g.kills,enemies:g.enemies.length,upgrades:[...g.shopLevels]});
      next+=120;
    }
  }
  console.log(JSON.stringify({hero,survived:Math.round(g.time),samples}));
}

import {
  W, H, HEROES, MONSTERS, SHOP, RELICS, difficulty, clamp
} from "./data.js";

import { Assets } from "./assets.js";
import { Game } from "./game.js";
import { Renderer } from "./render.js";

const $ = id => document.getElementById(id);
const game = new Game();
const assets = new Assets();
const renderer = new Renderer($("game"), assets);

const keys = new Set();
let stickId = null;
let savedMode = "menu";
let lastUI = "";
let audioContext = null;
let shopFeedback = "";

const clock = time =>
  `${Math.floor(time / 60).toString().padStart(2, "0")}:` +
  `${Math.floor(time % 60).toString().padStart(2, "0")}`;

const credits = `
  <p class="muted">
    美术：Riley Gombart<br>
    <a href="https://opengameart.org/content/animated-top-down-survivor-player"
       target="_blank" rel="noopener">Animated Top Down Survivor Player</a>
    · <a href="https://creativecommons.org/licenses/by/3.0/"
         target="_blank" rel="noopener">CC BY 3.0</a><br>
    <a href="https://opengameart.org/content/animated-top-down-zombie"
       target="_blank" rel="noopener">Animated Top Down Zombie</a>
    · <a href="https://creativecommons.org/publicdomain/zero/1.0/"
         target="_blank" rel="noopener">CC0</a><br>
    游戏内进行缩放、旋转、部分怪物换色及特效叠加。
  </p>
`;

function clearInput() {
  keys.clear();
  stickId = null;
  renderer.stick.active = false;
  renderer.stick.dx = renderer.stick.dy = 0;
  game.input.x = game.input.y = 0;
  game.input.manual = false;
}

function setMode(mode) {
  clearInput();
  game.mode = mode;
  lastUI = "";
  syncOverlay();
}

function buildText() {
  const owned = RELICS.filter(r => game.relics[r.id]);
  return owned.length
    ? owned.map(r => `${r.name} ×${game.relics[r.id]}`).join("　·　")
    : "尚未获得强化";
}

function syncOverlay() {
  const mode = game.mode;
  const signature = mode + "|" + game.pending + "|" +
    game.choices.map(c => c.id).join(",");

  if (signature === lastUI) return;
  lastUI = signature;

  $("overlay").hidden = mode === "run";
  $("overlay").classList.toggle("is-resuming", mode === "resume");
  $("app").inert = mode !== "run";
  $("pause").textContent = mode === "pause" ? "继续" : mode === "resume" ? "取消恢复" : "暂停";

  if (mode === "run") return;
  clearInput();

  if (mode === "menu") {
    $("panel").innerHTML = `
      <div class="eyebrow">LAST DEFENSE / NIGHTFALL</div>
      <h1>黑夜围城</h1>
      <p class="muted">
        击杀赚金币，随机选择强化。敌人会随时间持续变强。<br>
        不要原地站桩：观察前摇、横向闪避、绕开盾牌。
      </p>
      <div class="cards heroes">
        ${Object.entries(HEROES).map(([id, h]) => `
          <button class="card" data-start="${id}">
            <canvas data-preview-hero="${id}"></canvas>
            <h3 style="color:${h.color}">${h.name}</h3>
            <div class="tag">生命 ${h.hp} · 攻击 ${h.damage}</div>
            <p>${h.desc}</p>
            <b>选择并出战 →</b>
          </button>
        `).join("")}
      </div>
      <p class="muted">
        ${assets.status}<br>
        最高得分：${game.save.best}<br>
        WASD 移动 · Shift 闪避 · Q/E 技能 ·
        按住鼠标右键手动瞄准 · 空格暂停 · B 整备加点<br>
        按 B 手动整备，退出立即继续战斗；仅从暂停继续时倒计时 3 秒。
      </p>
      <div class="row"><button data-action="codex">怪物图鉴</button></div>
      ${credits}
    `;
  }

  if (mode === "pause") {
    $("panel").innerHTML = `
      <div class="eyebrow">TACTICAL BREAK</div>
      <h2>战斗暂停</h2>
      <p class="muted">
        ${HEROES[game.p.hero].name} · 生存 ${clock(game.time)}
        · 击杀 ${game.kills}<br>
        攻击 ${game.p.damage.toFixed(1)}
        · 基础射速 ${game.p.rate.toFixed(1)}
        · 弹道 ${game.p.shots}
        · 减伤 ${Math.round(game.p.armor * 100)}%
      </p>
      <p class="muted">${buildText()}</p>
      <div class="row">
        <button class="primary" data-action="resume">继续战斗</button>
        <button data-action="shop">整备加点 · B</button>
        <button data-action="codex">怪物图鉴</button>
        <button data-action="finish">结束本局</button>
      </div>
      ${credits}
    `;
  }

  if (mode === "shop") {
    shopFeedback = "";
    $("panel").className = "panel shop-panel";
    $("panel").innerHTML = `
      <div class="shop-head">
        <div><div class="eyebrow">FIELD WORKSHOP</div><h2>${(game.shopReason || "战术整备").split(" · ")[0]}</h2></div>
        <div class="shop-balance" id="shop-balance"></div>
      </div>
      <div class="freeze-note">整备期间战场暂停，退出立即继续战斗。可按 B 或 Esc 退出。</div>
      <div class="shop-stats" id="shop-stats"></div>
      <div class="shop-grid" id="shop-grid">
        ${SHOP.map((item, i) => `<button class="upgrade" data-shop="${i}"></button>`).join("")}
      </div>
      <div class="shop-footer">
        <span id="shop-feedback" role="status"></span>
        <button class="primary" data-action="close-shop">${game.shopReturn === "pause" ? "返回暂停" : "继续战斗 · B"}</button>
      </div>`;
    updateShopPanel();
  } else {
    $("panel").className = "panel";
  }

  if (mode === "resume") {
    $("panel").className = "panel resume-panel";
    $("panel").innerHTML = `
      <div class="eyebrow">RETURNING TO BATTLE</div>
      <div class="resume-count" id="resume-count">${Math.max(1, Math.ceil(game.resumeLeft || 3))}</div>
      <div>准备恢复战斗</div>
      <p class="muted">观察敌人位置，准备移动 · 战场仍冻结</p>
      <button data-action="cancel-resume">取消恢复 · Esc</button>`;
  }

  if (mode === "draft") {
    $("panel").innerHTML = `
      <div class="eyebrow">FIELD ADAPTATION</div>
      <h2>选择战场强化</h2>
      <p class="muted">等级 ${game.p.level} · 剩余 ${game.pending} 次选择 · 战斗已暂停<br>
        每次角色升级自动获得：攻击 +1% · 生命上限 +2 · 恢复 8 生命<br>
        选完立即继续战斗，需要购买属性时按 B。Boss 额外强化不重复发放升级成长。</p>
      <div class="cards">
        ${game.choices.map((r, i) => `
          <button class="card" data-pick="${i}">
            <div class="tag">强化 ${i + 1} · 已选 ${game.relics[r.id] || 0} 层</div>
            <h3>${r.name}</h3>
            <p>${r.desc}</p>
            <b>点击或按数字 ${i + 1}</b>
          </button>
        `).join("")}
      </div>
    `;
  }

  if (mode === "codex") {
    $("panel").innerHTML = `
      <div class="eyebrow">INFECTED DATABASE</div>
      <h2>感染者图鉴</h2>
      <p class="muted">图鉴期间暂停。特殊种类共享基础动画，并添加独立识别部件。</p>
      <button data-action="back">返回</button>
      <div class="codex">
        ${Object.entries(MONSTERS).map(([id, m]) => `
          <div class="card">
            <canvas data-preview-monster="${id}"></canvas>
            <div>
              <h3>${m.name}</h3>
              <div class="tag">累计击杀 ${game.save.kills[id] || 0}</div>
              <p>${m.desc}</p>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  if (mode === "over") {
    $("panel").innerHTML = `
      <div class="eyebrow">RUN COMPLETE</div>
      <h2>本局结束</h2>
      <p class="muted">
        生存 ${clock(game.time)} · 击杀 ${game.kills} · 等级 ${game.p.level}<br>
        得分 ${game.score} · 最高得分 ${game.save.best}
      </p>
      <p class="muted">${buildText()}</p>
      <div class="row">
        <button class="primary" data-start="${game.p.hero}">同角色再战</button>
        <button data-action="menu">重新选择角色</button>
        <button data-action="codex">怪物图鉴</button>
      </div>
    `;
  }

  $("panel").querySelectorAll("[data-preview-hero]").forEach(canvas => {
    renderer.preview(canvas, canvas.dataset.previewHero, true);
  });
  $("panel").querySelectorAll("[data-preview-monster]").forEach(canvas => {
    renderer.preview(canvas, canvas.dataset.previewMonster, false);
  });
}

function openCodex() {
  if (!["menu", "run", "pause", "over"].includes(game.mode)) return;
  savedMode = game.mode === "run" ? "pause" : game.mode;
  game.persist();
  setMode("codex");
}

function pause() {
  if (game.mode === "run") {
    game.persist();
    setMode("pause");
  } else if (game.mode === "pause") {
    clearInput();
    game.resume();
    lastUI = "";
    syncOverlay();
  } else if (game.mode === "resume") {
    setMode("pause");
  }
}

function toggleShop() {
  if (game.mode === "shop") {
    shopFeedback = "";
    clearInput();
    game.closeShop();
    lastUI = "";
    syncOverlay();
  } else if (game.mode === "run" || game.mode === "pause") {
    clearInput();
    game.openShop();
    shopFeedback = "";
    lastUI = "";
    syncOverlay();
  }
}

function itemValue(item, p, preview = false) {
  const fn = preview ? item.preview : item.value;
  if (typeof fn === "function") return fn(p);
  return preview ? item.desc : "当前属性";
}

function updateShopPanel() {
  if (game.mode !== "shop") return;
  const p = game.p;
  const balance = $("shop-balance");
  if (balance) balance.textContent = `金币 ${Math.floor(p.coin)}`;
  $("shop-stats").innerHTML = `<span>${HEROES[p.hero].name} · Lv.${p.level}</span>
    <span>生命 <b>${Math.ceil(p.hp)} / ${p.maxHp}</b></span>
    <span>护盾 ${Math.ceil(p.shield)} · 减伤 ${Math.round(p.armor * 100)}%</span>
    <span>穿透 ${p.pierce} · 技能冷却 ${Math.ceil(p.skillCD)}s</span>`;
  $("shop-grid")?.querySelectorAll("[data-shop]").forEach(button => {
    const index = Number(button.dataset.shop);
    const item = SHOP[index];
    const valid = item.valid(p);
    const cost = game.cost(index);
    const affordable = p.coin >= cost;
    button.disabled = false;
    button.setAttribute("aria-disabled", String(!valid));
    button.classList.toggle("broke", valid && !affordable);
    button.classList.toggle("maxed", !valid);
    button.innerHTML = `
      <span class="key">数字 ${index + 1}</span>
      <span class="level">等级 ${game.shopLevels[index]}</span>
      <h3>${item.name}</h3>
      <div class="upgrade-desc">${item.desc}</div>
      <div class="change">${itemValue(item, p)}${valid ? `<span class="arrow">→</span>${itemValue(item, p, true)}` : ""}</div>
      <span class="cost">${valid ? `费用 ${cost}` : "已满级"}</span>
      <span class="state">${!valid ? "该项已达到上限" : affordable ? "可购买 · 可连续点击" : `金币不足，还差 ${cost - Math.floor(p.coin)}`}</span>`;
  });
  const feedback = $("shop-feedback");
  if (feedback) feedback.textContent = shopFeedback;
}

function buyShop(index) {
  if (game.mode !== "shop") return;
  const item = SHOP[index];
  if (!item) return;
  const cost = game.cost(index);
  if (!item.valid(game.p)) shopFeedback = `${item.name} 已满级`;
  else if (game.p.coin < cost) shopFeedback = `金币不足：${item.name} 还差 ${cost - Math.floor(game.p.coin)}`;
  else {
    game.buy(index);
    shopFeedback = `已购买 ${item.name} · 当前等级 ${game.shopLevels[index]}`;
  }
  updateShopPanel();
}

function unlockAudio() {
  if (!game.soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!audioContext && AC) audioContext = new AC();
    audioContext?.resume().catch(() => {});
    game.audio = audioContext;
  } catch {}
}

$("panel").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  unlockAudio();

  if (button.dataset.start) {
    game.reset(button.dataset.start);
    clearInput();
    lastUI = "";
    syncOverlay();
    return;
  }

  if (button.dataset.pick !== undefined) {
    game.pick(Number(button.dataset.pick));
    syncOverlay();
    return;
  }

  if (button.dataset.shop !== undefined) {
    buyShop(Number(button.dataset.shop));
    return;
  }

  const action = button.dataset.action;
  if (action === "resume") pause();
  if (action === "shop") toggleShop();
  if (action === "cancel-resume") pause();
  if (action === "close-shop") toggleShop();
  if (action === "codex") openCodex();
  if (action === "back") setMode(savedMode);
  if (action === "menu") setMode("menu");
  if (action === "finish") {
    game.finish();
    syncOverlay();
  }
});

$("pause").onclick = pause;
$("codex").onclick = openCodex;
$("prep").onclick = toggleShop;

$("audio").onclick = () => {
  game.soundOn = !game.soundOn;
  $("audio").textContent = "音效：" + (game.soundOn ? "开" : "关");
  unlockAudio();
};

for (const [id, callback] of [
  ["dash", () => game.dash()],
  ["skill", () => game.useSkill()]
]) {
  $(id).addEventListener("pointerdown", event => {
    event.preventDefault();
    unlockAudio();
    callback();
  });
}

window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();

  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
    event.preventDefault();
  }

  if (key === " " && document.activeElement instanceof HTMLButtonElement) {
    document.activeElement.blur();
  }

  if (event.repeat && ([" ", "shift", "q", "e", "escape", "b"].includes(key) || /^[1-6]$/.test(key))) return;

  if (game.mode === "draft" && ["1", "2", "3"].includes(key)) {
    game.pick(Number(key) - 1);
    syncOverlay();
    return;
  }

  if (game.mode === "shop" && /^[1-6]$/.test(key)) {
    buyShop(Number(key) - 1);
    return;
  }

  if (game.mode === "codex" && key === "escape") {
    clearInput();
    setMode(savedMode);
    return;
  }

  if (key === "b") {
    toggleShop();
    return;
  }

  if (key === " " || key === "escape") {
    if (game.mode === "shop" && key === "escape") {
      toggleShop();
      return;
    }
    pause();
    return;
  }

  // 倒计时内可提前按住移动方向，恢复第一帧即可移动。
  if (game.mode === "resume" && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
    keys.add(key);
    return;
  }

  if (game.mode !== "run") return;
  unlockAudio();

  if (key === "shift") game.dash();
  else if (key === "q" || key === "e") game.useSkill();
  else keys.add(key);
});

window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));

const canvas = $("game");

function moveStick(point) {
  const s = renderer.stick;
  let dx = (point.x - s.x) / 45;
  let dy = (point.y - s.y) / 45;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  s.dx = dx;
  s.dy = dy;
}

canvas.addEventListener("pointerdown", event => {
  if (game.mode !== "run") return;
  event.preventDefault();
  unlockAudio();

  const point = renderer.point(event);

  if (event.pointerType === "mouse") {
    game.input.aim = point;
    if (event.button === 2) {
      game.input.manual = true;
      canvas.setPointerCapture(event.pointerId);
    }
  } else if (point.x < W * .42 && point.y > H * .48 && stickId === null) {
    stickId = event.pointerId;
    renderer.stick.active = true;
    renderer.stick.x = clamp(point.x, 55, W * .38);
    renderer.stick.y = clamp(point.y, H * .55, H - 55);
    moveStick(point);
    canvas.setPointerCapture(event.pointerId);
  }
});

canvas.addEventListener("pointermove", event => {
  const point = renderer.point(event);

  if (event.pointerType === "mouse") {
    game.input.aim = point;
  }
  if (event.pointerId === stickId) {
    event.preventDefault();
    moveStick(point);
  }
});

function releasePointer(event) {
  if (event.pointerId === stickId) {
    stickId = null;
    renderer.stick.active = false;
    renderer.stick.dx = renderer.stick.dy = 0;
  }
  if (event.pointerType === "mouse") game.input.manual = false;
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
canvas.addEventListener("lostpointercapture", releasePointer);
canvas.addEventListener("contextmenu", event => event.preventDefault());

function backgroundPause() {
  clearInput();
  if (game.mode === "run" || game.mode === "resume") setMode("pause");
  game.persist();
}

window.addEventListener("blur", backgroundPause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) backgroundPause();
});
window.addEventListener("pagehide", () => game.persist());

function updateHUD() {
  const p = game.p;
  const d = difficulty(game.time);

  $("hp-label").textContent = `生命 ${Math.ceil(p.hp)}/${p.maxHp}${p.shield > 0 ? ` +${Math.ceil(p.shield)}` : ""}`;
  $("hp-fill").style.width = `${clamp(p.hp / p.maxHp * 100, 0, 100)}%`;
  $("level-label").textContent = `Lv.${p.level}  ${Math.floor(p.xp)}/${p.need}`;
  $("xp-fill").style.width = `${clamp(p.xp / p.need * 100, 0, 100)}%`;
  $("coin-label").textContent = `金币 ${Math.floor(p.coin)}`;
  $("time-label").textContent = clock(game.time);
  $("battle-label").textContent = `击杀 ${game.kills} · ${game.event.name} · 敌血×${d.hp.toFixed(1)}`;

  const canBuy = SHOP.some((item, i) => item.valid(p) && p.coin >= game.cost(i));
  $("prep").classList.toggle("affordable", canBuy && (game.mode === "run" || game.mode === "pause"));
  $("prep").title = canBuy ? "有可负担的升级" : "打开整备面板 (B)";
  if (game.mode === "resume" && $("resume-count")) {
    $("resume-count").textContent = Math.max(1, Math.ceil(game.resumeLeft || 0));
  }

  $("dash").textContent = p.dashCD > 0
    ? `闪避\n${p.dashCD.toFixed(1)}s` : "闪避\nShift";

  $("skill").textContent = p.skillCD > 0
    ? `${HEROES[p.hero].skill}\n${Math.ceil(p.skillCD)}s`
    : `${HEROES[p.hero].skill}\nQ / E`;

  $("message").textContent = game.message;
  $("message").style.opacity = game.messageLife > 0 && game.mode === "run" ? 1 : 0;
}

await assets.load();
$("audio").textContent = "音效：" + (game.soundOn ? "开" : "关");
syncOverlay();

// 固定 60Hz 逻辑更新；暂停时不累计欠下的时间。
// 极端卡顿时丢弃多余积压，避免恢复后瞬间结算大量攻击。
let previous = performance.now();
let accumulator = 0;
let hudTimer = 0;
const STEP = 1 / 60;

function frame(now) {
  const realDelta = Math.min((now - previous) / 1000, .15);
  previous = now;

  if (game.mode === "run") {
    const s = renderer.stick;

    game.input.x =
      (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
      (keys.has("a") || keys.has("arrowleft") ? 1 : 0) + s.dx;

    game.input.y =
      (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
      (keys.has("w") || keys.has("arrowup") ? 1 : 0) + s.dy;

    accumulator += realDelta;
    let steps = 0;

    while (accumulator >= STEP && steps < 8 && game.mode === "run") {
      game.update(STEP);
      accumulator -= STEP;
      steps++;
    }

    if (steps >= 8 || game.mode !== "run") accumulator = 0;
  } else if (game.mode === "resume") {
    accumulator = 0;
    game.updateTransition(realDelta);
  } else {
    accumulator = 0;
  }

  renderer.draw(game);
  syncOverlay();

  hudTimer += realDelta;
  if (hudTimer >= .1) {
    hudTimer = 0;
    updateHUD();
  }

  requestAnimationFrame(frame);
}

updateHUD();
requestAnimationFrame(frame);

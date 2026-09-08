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
  $("pause").textContent = mode === "pause" ? "继续" : "暂停";

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
        按住鼠标右键手动瞄准 · 空格暂停
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
        <button data-action="codex">怪物图鉴</button>
        <button data-action="finish">结束本局</button>
      </div>
      ${credits}
    `;
  }

  if (mode === "draft") {
    $("panel").innerHTML = `
      <div class="eyebrow">FIELD ADAPTATION</div>
      <h2>选择战场强化</h2>
      <p class="muted">等级 ${game.p.level} · 剩余 ${game.pending} 次选择 · 战斗已暂停</p>
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
  if (game.mode === "draft" || game.mode === "codex") return;
  savedMode = game.mode;
  game.persist();
  setMode("codex");
}

function pause() {
  if (game.mode === "run") {
    game.persist();
    setMode("pause");
  } else if (game.mode === "pause") {
    setMode("run");
  }
}

function unlockAudio() {
  if (!game.soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!audioContext && AC) audioContext = new AC();
    audioContext?.resume();
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

  const action = button.dataset.action;
  if (action === "resume") setMode("run");
  if (action === "codex") openCodex();
  if (action === "back") setMode(savedMode);
  if (action === "menu") setMode("menu");
  if (action === "finish") {
    game.finish();
    syncOverlay();
  }
});

$("shop").innerHTML = SHOP.map((item, i) => `
  <button class="shop" data-shop="${i}">
    <b>${item.name}<em></em></b><small>${item.desc}</small>
  </button>
`).join("");

$("shop").addEventListener("click", event => {
  const button = event.target.closest("[data-shop]");
  if (button) game.buy(Number(button.dataset.shop));
});

$("pause").onclick = pause;
$("codex").onclick = openCodex;

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

  if (event.repeat && [" ", "shift", "q", "e", "escape"].includes(key)) return;

  if (game.mode === "draft" && ["1", "2", "3"].includes(key)) {
    game.pick(Number(key) - 1);
    syncOverlay();
    return;
  }

  if (game.mode === "codex" && key === "escape") {
    setMode(savedMode);
    return;
  }

  if (key === " " || key === "escape") {
    pause();
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
  if (game.mode === "run") setMode("pause");
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

  $("hud").innerHTML = `
    <span style="color:#a4d2ba">生命 ${Math.ceil(p.hp)}/${p.maxHp}</span>
    ${p.shield > 0 ? ` · 护盾 ${Math.ceil(p.shield)}` : ""}
    <span style="color:#e4c18c">　金币 ${Math.floor(p.coin)}</span>
   　Lv.${p.level}　经验 ${Math.floor(p.xp)}/${p.need}<br>
    ${clock(game.time)}　击杀 ${game.kills}　${game.event.name}
   　敌人生命 ×${d.hp.toFixed(1)}
  `;

  $("shop").querySelectorAll("[data-shop]").forEach(button => {
    const index = Number(button.dataset.shop);
    const item = SHOP[index];
    const valid = item.valid(p);
    const cost = game.cost(index);

    button.querySelector("em").textContent = valid ? "$" + cost : "MAX";
    button.disabled = game.mode !== "run" || !valid || p.coin < cost;
    button.title = `已升级 ${game.shopLevels[index]} 次`;
  });

  $("dash").textContent = p.dashCD > 0
    ? `闪避\n${p.dashCD.toFixed(1)}s` : "闪避\nShift";

  $("skill").textContent = p.skillCD > 0
    ? `${HEROES[p.hero].skill}\n${Math.ceil(p.skillCD)}s`
    : `${HEROES[p.hero].skill}\nQ / E`;

  $("message").textContent = game.message;
  $("message").style.opacity = game.messageLife > 0 && game.mode === "run" ? 1 : 0;
}

await assets.load();
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
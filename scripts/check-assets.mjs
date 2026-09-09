import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { HEROES } from '../data.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, 'assets/manifest.json'), 'utf8'));
const required = ['feet_idle', 'feet_run', 'zombie_idle', 'zombie_move', 'zombie_attack'];
for (const hero of Object.values(HEROES)) {
  for (const state of ['idle', 'move', 'shoot']) required.push(`player_${hero.weapon}_${state}`);
}
for (const key of required) assert.ok(manifest[key], `缺少动画组：${key}`);

let frames = 0;
for (const [key, info] of Object.entries(manifest)) {
  assert.ok(Array.isArray(info.frames) && info.frames.length > 0, `${key} 没有动画帧`);
  for (const field of ['width', 'height', 'fps']) {
    assert.ok(Number.isFinite(info[field]) && info[field] > 0, `${key}.${field} 无效`);
  }
  for (const src of info.frames) {
    assert.ok(typeof src === 'string' && src.startsWith('assets/'), `资源必须位于 assets/：${src}`);
    const path = resolve(root, src);
    assert.ok(!relative(root, path).startsWith('..' + sep), `资源路径越界：${src}`);
    const data = await readFile(path);
    assert.ok(data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `不是有效 PNG：${src}`);
    frames++;
  }
}
for (const file of ['index.html', 'main.js', 'game.js', 'render.js', 'assets.js', 'data.js', 'combat.js', 'behaviors.js', 'assets/CREDITS.txt']) {
  assert.ok((await readFile(resolve(root, file))).length > 0, `缺少运行文件：${file}`);
}
console.log(`资源检查通过：${Object.keys(manifest).length} 组动画、${frames} 帧，所有运行文件齐全。`);

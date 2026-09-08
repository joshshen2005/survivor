export class Assets {
  constructor() {
    this.groups = {};
    this.cache = new Map();
    this.ready = false;
    this.status = "备用绘制";
  }

  async load() {
    try {
      const response = await fetch("./assets/manifest.json");
      if (!response.ok) throw new Error("未找到资源清单");
      const manifest = await response.json();

      await Promise.all(Object.entries(manifest).map(async ([key, info]) => {
        const frames = await Promise.all(info.frames.map(src =>
          new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = "./" + src;
          })
        ));

        const valid = frames.filter(Boolean);
        if (valid.length) {
          this.groups[key] = {
            frames: valid,
            width: info.width,
            height: info.height,
            fps: info.fps || 20
          };
        }
      }));

      this.ready = Boolean(
        this.groups.player_rifle_move && this.groups.zombie_move
      );
      this.status = this.ready ? "本地动画已加载" : "部分资源缺失，使用备用绘制";
    } catch (error) {
      console.warn("素材加载:", error.message);
      this.status = "未安装动画素材，当前为备用绘制";
    }
  }

  frame(key, time, filter = "none") {
    const group = this.groups[key];
    if (!group) return null;

    const index = Math.floor(Math.max(0, time) * group.fps) % group.frames.length;
    const cacheKey = key + "|" + index + "|" + filter;

    if (!this.cache.has(cacheKey)) {
      const image = group.frames[index];
      const c = document.createElement("canvas");

      // 预缩放，限制动画帧缓存体积。
      const scale = Math.min(1, 176 / group.width);
      c.width = Math.ceil(group.width * scale);
      c.height = Math.ceil(group.height * scale);

      const ctx = c.getContext("2d");
      ctx.filter = filter;
      ctx.drawImage(
        image,
        (group.width - image.width) * scale / 2,
        (group.height - image.height) * scale / 2,
        image.width * scale,
        image.height * scale
      );

      this.cache.set(cacheKey, c);
    }
    return this.cache.get(cacheKey);
  }
}
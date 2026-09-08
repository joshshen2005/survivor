from pathlib import Path, PurePosixPath
from urllib.request import Request, urlopen
from urllib.parse import urljoin, unquote, urlsplit
from html.parser import HTMLParser
from collections import defaultdict
import io
import json
import re
import struct
import zipfile

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets"
OUT.mkdir(exist_ok=True)

PACKS = [
    (
        "survivor",
        "https://opengameart.org/content/animated-top-down-survivor-player",
        "Top_Down_Survivor_2.zip"
    ),
    (
        "zombie",
        "https://opengameart.org/content/animated-top-down-zombie",
        "tds_zombie.zip"
    )
]

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.urls.append(href)

def download(url):
    req = Request(url, headers={"User-Agent": "SurvivorAssetSetup/1.0"})
    with urlopen(req, timeout=60) as response:
        return response.read()

def archive_bytes(page, filename):
    local = ROOT / filename
    if local.exists():
        print("使用本地压缩包:", filename)
        return local.read_bytes()

    parser = Links()
    parser.feed(download(page).decode("utf-8", errors="replace"))

    for href in parser.urls:
        path = unquote(urlsplit(href).path)
        if Path(path).name.lower() == filename.lower():
            url = urljoin(page, href)
            print("下载:", filename)
            data = download(url)
            local.write_bytes(data)
            return data

    raise RuntimeError(
        f"未找到 {filename}。请从素材作者页面手动下载并放到项目根目录。"
    )

def group_name(pack, path):
    name = PurePosixPath(path).name.lower()
    full = path.lower()

    if pack == "survivor":
        if "feet" in full:
            for state in ("idle", "walk", "run"):
                if state in name:
                    return "feet_" + state

        weapon = next(
            (w for w in ("rifle", "handgun", "shotgun") if w in full), None
        )
        if weapon:
            for state in ("idle", "move", "shoot"):
                if state in name:
                    return "player_" + weapon + "_" + state
    else:
        for state in ("idle", "move", "attack"):
            if state in name:
                return "zombie_" + state
    return None

def frame_number(path):
    match = re.search(r"(\d+)\.png$", path, re.I)
    return int(match.group(1)) if match else 0

manifest = {}

for pack, page, filename in PACKS:
    raw = archive_bytes(page, filename)
    grouped = defaultdict(list)

    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for item in archive.infolist():
            path = item.filename.replace("\\", "/")

            if (
                not path.lower().endswith(".png")
                or "__macosx" in path.lower()
                or PurePosixPath(path).name.startswith("._")
            ):
                continue

            group = group_name(pack, path)
            if group:
                grouped[group].append(item)

        for group, items in grouped.items():
            # 避免同一压缩包里重复目录导致动画帧重复。
            unique = {}
            for item in items:
                unique.setdefault(
                    PurePosixPath(item.filename.replace("\\", "/")).name.lower(),
                    item
                )
            items = sorted(unique.values(), key=lambda x: frame_number(x.filename))
            folder = OUT / group
            folder.mkdir(exist_ok=True)

            paths, max_w, max_h = [], 0, 0
            for index, item in enumerate(items):
                if item.file_size > 12_000_000:
                    raise RuntimeError("异常大的图片文件，停止处理")

                data = archive.read(item)
                if data[:8] != b"\x89PNG\r\n\x1a\n":
                    continue

                width, height = struct.unpack(">II", data[16:24])
                max_w, max_h = max(max_w, width), max(max_h, height)
                target = folder / f"{index:03}.png"
                target.write_bytes(data)
                paths.append(target.relative_to(ROOT).as_posix())

            if paths:
                manifest[group] = {
                    "frames": paths,
                    "width": max_w,
                    "height": max_h,
                    "fps": 20
                }
                print(group, ":", len(paths), "帧")

required = ["player_rifle_move", "zombie_move"]
missing = [key for key in required if key not in manifest]
if missing:
    raise RuntimeError("未识别到必要动画: " + ", ".join(missing))

(OUT / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

credits = """Animated Top Down Survivor Player
Author: Riley Gombart
Source: https://opengameart.org/content/animated-top-down-survivor-player
License: CC BY 3.0
License URL: https://creativecommons.org/licenses/by/3.0/
In-game presentation: scaled, rotated, composited with effects.

Animated Top Down Zombie
Author: Riley Gombart
Source: https://opengameart.org/content/animated-top-down-zombie
License: CC0
License URL: https://creativecommons.org/publicdomain/zero/1.0/
In-game presentation: scaled, rotated, recolored and composited with effects.

No endorsement by the original artist is implied.
"""
(OUT / "CREDITS.txt").write_text(credits, encoding="utf-8")
print("\n素材已生成。运行 python -m http.server 8000 --bind 127.0.0.1")

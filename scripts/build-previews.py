"""Generate WebP gallery previews without modifying original artwork.

Run: python scripts/build-previews.py (requires Pillow).
Run again after making additional artwork public in the admin.
"""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "assets" / "previews"
MANIFEST = ROOT / "data" / "media-previews.json"
# 400 serves the cover gallery and small plates; 1280 is the viewer's quick preview.
WIDTHS = (400, 640, 1280)


def tone(thumbnail):
    """Average colour of a preview, painted behind it while it loads."""
    if thumbnail.mode == "RGBA":
        paper = Image.new("RGBA", thumbnail.size, (230, 227, 220, 255))
        thumbnail = Image.alpha_composite(paper, thumbnail)
    red, green, blue = thumbnail.convert("RGB").resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return f"#{red:02x}{green:02x}{blue:02x}"


def build(item):
    source = ROOT / item["src"]
    fingerprint = f'{item["src"]}:{source.stat().st_size}:{source.stat().st_mtime_ns}'
    stem = hashlib.sha1(fingerprint.encode()).hexdigest()[:16]
    with Image.open(source) as original:
        original.seek(0)
        artwork = ImageOps.exif_transpose(original)
        width, height = artwork.size
        artwork = artwork.convert("RGBA" if "A" in artwork.getbands() or "transparency" in artwork.info else "RGB")
        variants = []
        color = None
        for target in WIDTHS:
            filename = f"{stem}-{target}.webp"
            thumbnail = artwork.copy()
            thumbnail.thumbnail((target, 1800), Image.Resampling.LANCZOS)
            if not (OUTPUT / filename).exists():
                thumbnail.save(OUTPUT / filename, "WEBP", quality=84, method=4)
            color = color or tone(thumbnail)
            variants.append({"src": f"assets/previews/{filename}", "width": thumbnail.width})
        return item["src"], {"width": width, "height": height, "color": color, "variants": variants}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    data = json.loads((ROOT / "data" / "portfolio-data.json").read_text(encoding="utf-8"))
    items = [item for item in data["items"] if item.get("visible") is not False and item["mediaType"] != "video"]
    manifest = {}
    errors = []

    def safe_build(item):
        try:
            return build(item)
        except Exception as error:
            errors.append(f'{item["src"]}: {error}')
            return None

    with ThreadPoolExecutor(max_workers=4) as pool:
        for index, result in enumerate(pool.map(safe_build, items), 1):
            if result:
                manifest[result[0]] = result[1]
            if index % 25 == 0:
                print(f"Prepared {index}/{len(items)} assets", flush=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Saved {len(manifest)} preview entries. Originals unchanged.", flush=True)
    for error in errors:
        print(error)


if __name__ == "__main__":
    main()

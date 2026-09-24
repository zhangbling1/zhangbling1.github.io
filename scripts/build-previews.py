"""Generate WebP gallery previews without modifying original artwork.

Run: python scripts/build-previews.py (requires Pillow).
Videos get a poster from one of their own frames when PyAV is installed
(pip install av); without it, posters made earlier are kept as they are.
Run again after making additional artwork public in the admin.
"""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps, ImageStat

try:
    import av
except ImportError:
    av = None

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "assets" / "previews"
MANIFEST = ROOT / "data" / "media-previews.json"
# 400 serves the cover gallery and small plates; 1280 is the viewer's quick preview.
WIDTHS = (400, 640, 1280)
# Decoder names mapped to the codec the page checks the browser can play.
CODECS = {"libdav1d": "av1", "libaom-av1": "av1", "av1": "av1", "h264": "h264", "hevc": "hevc", "vp9": "vp9", "libvpx-vp9": "vp9"}


def tone(thumbnail):
    """Average colour of a preview, painted behind it while it loads."""
    if thumbnail.mode == "RGBA":
        paper = Image.new("RGBA", thumbnail.size, (230, 227, 220, 255))
        thumbnail = Image.alpha_composite(paper, thumbnail)
    red, green, blue = thumbnail.convert("RGB").resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return f"#{red:02x}{green:02x}{blue:02x}"


def render(artwork, stem):
    """Write every preview width of one still; return the variants and its tone."""
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
    return variants, color


def build_image(item):
    source = ROOT / item["src"]
    fingerprint = f'{item["src"]}:{source.stat().st_size}:{source.stat().st_mtime_ns}'
    stem = hashlib.sha1(fingerprint.encode()).hexdigest()[:16]
    with Image.open(source) as original:
        original.seek(0)
        artwork = ImageOps.exif_transpose(original)
        width, height = artwork.size
        artwork = artwork.convert("RGBA" if "A" in artwork.getbands() or "transparency" in artwork.info else "RGB")
        variants, color = render(artwork, stem)
        return item["src"], {"width": width, "height": height, "color": color, "variants": variants}


def liveliness(still):
    """Contrast, less a penalty for frames that are close to black or white."""
    stat = ImageStat.Stat(still.convert("L").resize((96, 54)))
    return stat.stddev[0] - abs(stat.mean[0] - 118) * .35


def build_video(item, previous):
    source = ROOT / item["src"]
    # Named after the file's content, so every copy of the repository agrees on the posters.
    digest = hashlib.sha1(item["src"].encode())
    with open(source, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    stem = digest.hexdigest()[:16]
    known = previous.get(item["src"])
    if known and all(variant["src"].startswith(f"assets/previews/{stem}-") and (ROOT / variant["src"]).exists() for variant in known["variants"]):
        return item["src"], known
    if av is None:
        if known:
            return item["src"], known
        raise RuntimeError("video posters need PyAV (pip install av)")
    with av.open(str(source)) as container:
        stream = container.streams.video[0]
        codec = CODECS.get(stream.codec_context.name, stream.codec_context.name)
        duration = float(container.duration) / av.time_base if container.duration else 0.0
        # Only keyframes are considered; the poster is the liveliest one clear of
        # the fades at either end of the clip.
        stream.codec_context.skip_frame = "NONKEY"
        best = fallback = None
        for frame in container.decode(stream):
            if not frame.key_frame:
                continue
            moment = float(frame.time or 0)
            if duration and moment > .7 * duration:
                break
            still = frame.to_image()
            score = liveliness(still)
            if fallback is None or score > fallback[0]:
                fallback = (score, still)
            if moment >= .08 * duration and (best is None or score > best[0]):
                best = (score, still)
        if fallback is None:
            raise RuntimeError("no frame could be decoded")
        still = (best or fallback)[1].convert("RGB")
        variants, color = render(still, stem)
        return item["src"], {"width": stream.width, "height": stream.height, "color": color, "duration": round(duration, 1), "codec": codec, "variants": variants}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    data = json.loads((ROOT / "data" / "portfolio-data.json").read_text(encoding="utf-8"))
    items = [item for item in data["items"] if item.get("visible") is not False]
    previous = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    manifest = {}
    errors = []
    if av is None and any(item["mediaType"] == "video" for item in items):
        print("PyAV is not installed: existing video posters are kept; `pip install av` makes posters for new videos.", flush=True)

    def safe_build(item):
        try:
            return build_video(item, previous) if item["mediaType"] == "video" else build_image(item)
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

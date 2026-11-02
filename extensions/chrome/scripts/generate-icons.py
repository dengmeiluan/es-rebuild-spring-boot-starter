"""Generate the SearchDeck extension icons (no text, deterministic)."""
from pathlib import Path
from PIL import Image, ImageDraw

SIZES = (16, 48, 128)
SCALE = 8
OUT = Path(__file__).resolve().parent.parent / "icons"


def gradient(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    top = (45, 212, 191)
    bottom = (15, 118, 110)
    for y in range(size):
        ratio = y / max(size - 1, 1)
        color = tuple(round(top[i] * (1 - ratio) + bottom[i] * ratio) for i in range(3))
        ImageDraw.Draw(image).line((0, y, size, y), fill=color + (255,))
    return image


def render(size: int) -> Image.Image:
    canvas = size * SCALE
    image = gradient(canvas)
    mask = Image.new("L", (canvas, canvas), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, canvas - 1, canvas - 1), radius=int(canvas * 0.22), fill=255
    )
    image.putalpha(mask)

    draw = ImageDraw.Draw(image)
    bar_height = int(canvas * 0.085)
    radius = bar_height // 2
    left = int(canvas * 0.22)
    widths = (0.56, 0.41, 0.27)
    starts = (0.28, 0.445, 0.61)
    for start, width in zip(starts, widths):
        top = int(canvas * start)
        draw.rounded_rectangle(
            (left, top, left + int(canvas * width), top + bar_height),
            radius=radius,
            fill=(6, 32, 29, 220),
        )

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        render(size).save(OUT / f"icon{size}.png", optimize=True)
    print(f"wrote {len(SIZES)} icons to {OUT}")


if __name__ == "__main__":
    main()

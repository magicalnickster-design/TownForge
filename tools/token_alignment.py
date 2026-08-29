"""Shared helpers for head-centered top-down token placement."""

from __future__ import annotations

from PIL import Image

# Fraction from the top of the alpha bbox to the head center (between the ears).
HEAD_CENTER_Y_RATIO = 0.36


def alpha_bbox(img: Image.Image) -> tuple[int, int, int, int] | None:
    return img.convert("RGBA").split()[3].getbbox()


def head_center_point(bbox: tuple[int, int, int, int]) -> tuple[float, float]:
    left, top, right, bottom = bbox
    cx = (left + right) / 2
    head_y = top + (bottom - top) * HEAD_CENTER_Y_RATIO
    return cx, head_y


def paste_head_centered(
    canvas: Image.Image,
    sprite: Image.Image,
    *,
    head_ratio: float = HEAD_CENTER_Y_RATIO,
) -> Image.Image:
    """Paste sprite so the estimated head center lands on the canvas center."""
    bbox = alpha_bbox(sprite)
    if not bbox:
        x = (canvas.width - sprite.width) // 2
        y = (canvas.height - sprite.height) // 2
    else:
        left, top, right, bottom = bbox
        cx = (left + right) / 2
        head_y = top + (bottom - top) * head_ratio
        x = round(canvas.width / 2 - cx)
        y = round(canvas.height / 2 - head_y)
    canvas.paste(sprite, (x, y), sprite)
    return canvas

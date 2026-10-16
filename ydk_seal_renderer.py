#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YDK スマート電子印鑑スタジオ - Headless 高精細印影レンダラー (ydk_seal_renderer.py)
AIエージェントがブラウザを開かずに 600DPI 透過PNG電子印鑑（実物角印・代表者丸印・4行角印・認印・日付データ印・ビジネス印）を即時生成するエンジン
"""

import argparse
import base64
import datetime
import io
import json
import math
import os
import random
import re
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OFFICIAL_SEAL_TS = os.path.join(SCRIPT_DIR, "src", "utils", "officialSealBase64.ts")

# Windows 標準日本語フォントの優先探索リスト
SERIF_FONTS = [
    r"C:\Windows\Fonts\yumindb.ttf",      # 游明朝 Demibold
    r"C:\Windows\Fonts\BIZ-UDMinchoM.ttc", # BIZ UD明朝 Medium
    r"C:\Windows\Fonts\msmincho.ttc",      # MS 明朝
    r"C:\Windows\Fonts\yumin.ttf",
]

SANS_FONTS = [
    r"C:\Windows\Fonts\YuGothB.ttc",       # 游ゴシック Bold
    r"C:\Windows\Fonts\BIZ-UDGothicB.ttc", # BIZ UDゴシック Bold
    r"C:\Windows\Fonts\meiryob.ttc",       # メイリオ Bold
    r"C:\Windows\Fonts\msgothic.ttc",      # MS ゴシック
]


def load_font(size: int, style: str = "serif") -> ImageFont.FreeTypeFont:
    candidates = SERIF_FONTS if style != "sans" else SANS_FONTS
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, max(8, int(size)))
            except Exception:
                continue
    return ImageFont.load_default()


def parse_color(hex_str: str):
    clean = (hex_str or "ffd80016").lstrip("#")
    if len(clean) == 8:
        clean = clean[2:]
    if len(clean) == 6:
        return (int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16))
    return (216, 0, 22)


def get_today_stamp_date() -> str:
    now = datetime.datetime.now()
    return f"'{str(now.year)[-2:]}.{now.month:02d}.{now.day:02d}"


def load_official_scan_base64() -> str:
    if not os.path.exists(OFFICIAL_SEAL_TS):
        return ""
    with open(OFFICIAL_SEAL_TS, "r", encoding="utf-8") as f:
        content = f.read()
    m = re.search(r"data:image/png;base64,([A-Za-z0-9+/=]+)", content)
    return m.group(1) if m else ""


PRESETS = {
    "preset-ydk-official-scan": {
        "id": "preset-ydk-official-scan",
        "aliases": ["ydk-official-scan", "official", "実物角印", "公式角印"],
        "name": "YDK 公式透過角印（実物印影 21mm）",
        "type": "user_scan",
        "text": "株式会社\nYDK\nリノベー\nション印",
        "color": "ffd80016",
        "pasteEdge": 21.0,
        "kasumiLevel": 0,
    },
    "preset-ydk-kakuin-4line": {
        "id": "preset-ydk-kakuin-4line",
        "aliases": ["ydk-kakuin", "kakuin", "角印", "社印"],
        "name": "YDK 会社角印（4行・印付 21mm）",
        "type": "business",
        "text": "株式会社\nYDK\nリノベー\nション印",
        "color": "ffd80016",
        "thickness": 4,
        "pasteEdge": 21.0,
        "kasumiLevel": 25,
        "direction": 1,
        "frameFigure": 0,
    },
    "preset-ydk-president": {
        "id": "preset-ydk-president",
        "aliases": ["ydk-president", "president", "代表者印", "丸印"],
        "name": "YDK 代表者印（丸印 18mm）[.uo3]",
        "type": "president",
        "text": "株式会社YDKリノベーション代表者印",
        "centerText": "代表取\n締役印",
        "color": "ffd80016",
        "thickness": 5,
        "pasteEdge": 18.0,
        "kasumiLevel": 25,
    },
    "preset-ydk-business-3line": {
        "id": "preset-ydk-business-3line",
        "aliases": ["ydk-3line", "3行角印"],
        "name": "YDK 角印（3行横 18mm）[.xio]",
        "type": "business",
        "text": "株式会社\nYDK\nリノベーション",
        "color": "ffd80016",
        "thickness": 3,
        "pasteEdge": 18.0,
        "kasumiLevel": 25,
        "direction": 1,
        "frameFigure": 0,
    },
    "preset-ydk-japan-kakuin": {
        "id": "preset-ydk-japan-kakuin",
        "aliases": ["ydk-japan-kakuin", "japan-kakuin", "やればできるこ角印"],
        "name": "やればできるこJAPAN 会社角印（21mm）",
        "type": "business",
        "text": "やればで\nきるこ\nJAPAN\n株式会社印",
        "color": "ffd80016",
        "thickness": 4,
        "pasteEdge": 21.0,
        "kasumiLevel": 25,
        "direction": 1,
        "frameFigure": 0,
    },
    "preset-ydk-japan-president": {
        "id": "preset-ydk-japan-president",
        "aliases": ["ydk-japan-president", "japan-president", "やればできるこ代表者印"],
        "name": "やればできるこJAPAN 代表者印（18mm）",
        "type": "president",
        "text": "やればできるこJAPAN株式会社代表者印",
        "centerText": "代表取\n締役印",
        "color": "ffd80016",
        "thickness": 5,
        "pasteEdge": 18.0,
        "kasumiLevel": 25,
    },
    "preset-abe-mitome": {
        "id": "preset-abe-mitome",
        "aliases": ["abe-mitome", "mitome", "阿部", "認印", "担当印"],
        "name": "阿部 認印（丸印 9.5mm）[.l1u]",
        "type": "mitome",
        "text": "阿部",
        "color": "ffd80016",
        "thickness": 3,
        "pasteEdge": 9.5,
        "kasumiLevel": 20,
        "direction": 0,
        "frameFigure": 0,
    },
    "preset-abe-full": {
        "id": "preset-abe-full",
        "aliases": ["abe-full", "実印", "阿部裕樹"],
        "name": "阿部裕樹 実印（13.5mm）",
        "type": "mitome",
        "text": "阿部\n裕樹",
        "color": "ffd80016",
        "thickness": 3.5,
        "pasteEdge": 13.5,
        "kasumiLevel": 22,
        "direction": 0,
        "frameFigure": 0,
    },
    "preset-ydk-datename": {
        "id": "preset-ydk-datename",
        "aliases": ["ydk-datename", "datename", "date", "日付印", "データ印", "検印"],
        "name": "YDK データネーム日付印（15mm）",
        "type": "datename",
        "text": "YDKリノベ",
        "dateText": "",
        "bottomText": "阿部",
        "color": "ffd80016",
        "thickness": 3,
        "pasteEdge": 15.0,
        "kasumiLevel": 18,
        "frameFigure": 0,
    },
    "preset-tobitawa-kakuin": {
        "id": "preset-tobitawa-kakuin",
        "aliases": ["tobitawa-kakuin", "飛田和塗装印"],
        "name": "飛田和塗装印（角印 24mm）[.0ni]",
        "type": "business",
        "text": "飛田和\n塗装印",
        "color": "ffd80016",
        "thickness": 6,
        "pasteEdge": 24.0,
        "kasumiLevel": 30,
        "direction": 0,
        "frameFigure": 0,
    },
    "preset-invoice-enclosed": {
        "id": "preset-invoice-enclosed",
        "aliases": ["invoice-enclosed", "invoice", "請求書在中"],
        "name": "ビジネス印「請求書在中」",
        "type": "business",
        "text": "請求書在中",
        "color": "ff1d4ed8",
        "thickness": 3.5,
        "pasteEdge": 24.0,
        "kasumiLevel": 15,
        "direction": 1,
        "frameFigure": 2,
    },
    "preset-approved": {
        "id": "preset-approved",
        "aliases": ["approved", "承認済"],
        "name": "ビジネス印「承認済」",
        "type": "business",
        "text": "承認済",
        "color": "ffd80016",
        "thickness": 3.5,
        "pasteEdge": 16.0,
        "kasumiLevel": 18,
        "direction": 1,
        "frameFigure": 1,
    },
}


def resolve_preset(query: str) -> dict:
    if not query:
        return dict(PRESETS["preset-ydk-official-scan"])
    q = query.strip().lower()
    if q in PRESETS:
        return dict(PRESETS[q])
    for k, v in PRESETS.items():
        if q == k.lower() or q in [a.lower() for a in v.get("aliases", [])]:
            return dict(v)
    for k, v in PRESETS.items():
        if q in k.lower() or q in v["name"].lower() or any(q in a.lower() for a in v.get("aliases", [])):
            return dict(v)
    return dict(PRESETS["preset-ydk-official-scan"])


def draw_bold_text(draw: ImageDraw.ImageDraw, pos, text: str, font, fill, stroke_width: int = 2):
    draw.text(pos, text, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=fill)


def apply_kasumi_effect(img: Image.Image, kasumi_level: int, seed_str: str = "ydk") -> Image.Image:
    if kasumi_level <= 0:
        return img
    rng = random.Random(seed_str)
    w, h = img.size
    pixels = img.load()
    num_specks = int((w * h) * (kasumi_level / 100.0) * 0.008)
    for _ in range(num_specks):
        cx = rng.randint(0, w - 1)
        cy = rng.randint(0, h - 1)
        rx = rng.randint(1, 4)
        ry = rng.randint(1, 3)
        for dy in range(-ry, ry + 1):
            for dx in range(-rx, rx + 1):
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < w and 0 <= ny < h:
                    r, g, b, a = pixels[nx, ny]
                    if a > 0:
                        pixels[nx, ny] = (r, g, b, int(a * 0.18))
    return img


def render_stamp_image(cfg: dict, size_px: int = 600) -> Image.Image:
    stype = cfg.get("type", "business")
    rgb_col = parse_color(cfg.get("color", "ffd80016"))
    rgba_col = (rgb_col[0], rgb_col[1], rgb_col[2], 242)
    kasumi = int(cfg.get("kasumiLevel", 20))

    # 1. 実物透過角印スキャンデータ
    if stype == "user_scan" or cfg.get("id") == "preset-ydk-official-scan":
        b64 = load_official_scan_base64()
        if b64:
            raw = base64.b64decode(b64)
            scan_img = Image.open(io.BytesIO(raw)).convert("RGBA")
            scan_img = scan_img.resize((size_px, size_px), Image.Resampling.LANCZOS)
            return apply_kasumi_effect(scan_img, kasumi, cfg.get("id", "scan"))

    img = Image.new("RGBA", (size_px, size_px), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size_px / 2.0, size_px / 2.0
    thickness = float(cfg.get("thickness", 4.0))
    border_w = max(6, int(size_px * (thickness * 0.0075)))

    # 2. 代表者印 (丸印・外周回文＋内円2列縦書き)
    if stype == "president":
        outer_r = size_px * 0.45
        inner_r = size_px * 0.255
        draw.ellipse(
            [cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r],
            outline=rgba_col,
            width=border_w,
        )
        draw.ellipse(
            [cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r],
            outline=rgba_col,
            width=max(4, int(border_w * 0.65)),
        )

        ring_text = (cfg.get("text") or "株式会社YDKリノベーション代表者印").replace("\n", "")
        ring_r = (outer_r + inner_r) / 2.0
        n_chars = max(1, len(ring_text))
        char_size = int(min((outer_r - inner_r) * 0.78, (2 * math.pi * ring_r / (n_chars + 1)) * 0.92))
        ring_font = load_font(char_size, "serif")

        # 頂点(・)マーク
        dot_r = max(4, int(char_size * 0.16))
        draw.ellipse(
            [cx - dot_r, cy - ring_r - dot_r, cx + dot_r, cy - ring_r + dot_r],
            fill=rgba_col,
        )

        # 時計回りに回文配置
        span_deg = 328.0
        start_deg = -90.0 + (360.0 - span_deg) / 2.0
        step_deg = span_deg / max(1, n_chars - 1) if n_chars > 1 else 0
        for i, ch in enumerate(ring_text):
            angle_deg = start_deg + i * step_deg
            angle_rad = math.radians(angle_deg)
            tx = cx + ring_r * math.cos(angle_rad)
            ty = cy + ring_r * math.sin(angle_rad)

            ch_canvas = Image.new("RGBA", (char_size * 2, char_size * 2), (0, 0, 0, 0))
            ch_draw = ImageDraw.Draw(ch_canvas)
            bbox = ch_draw.textbbox((0, 0), ch, font=ring_font)
            cw = bbox[2] - bbox[0]
            ch_h = bbox[3] - bbox[1]
            draw_bold_text(
                ch_draw,
                (char_size - cw / 2 - bbox[0], char_size - ch_h / 2 - bbox[1]),
                ch,
                ring_font,
                rgba_col,
                stroke_width=max(1, int(char_size * 0.04)),
            )
            rotated = ch_canvas.rotate(-(angle_deg + 90), resample=Image.Resampling.BICUBIC)
            img.alpha_composite(rotated, (int(tx - char_size), int(ty - char_size)))

        # 内円の中央テキスト (縦書き2列: 右から左)
        center_lines = [line.strip() for line in (cfg.get("centerText") or "代表取\n締役印").split("\n") if line.strip()]
        n_cols = max(1, len(center_lines))
        max_rows = max(len(col) for col in center_lines)
        c_font_size = int((inner_r * 1.55) / max(n_cols, max_rows))
        c_font = load_font(c_font_size, "serif")
        col_step = (inner_r * 1.15) / max(1, n_cols)
        start_col_x = cx + (col_step * (n_cols - 1)) / 2.0
        for c_idx, col_str in enumerate(center_lines):
            col_x = start_col_x - c_idx * col_step
            rows = len(col_str)
            row_step = (inner_r * 1.32) / max(1, rows)
            start_row_y = cy - (row_step * (rows - 1)) / 2.0
            for r_idx, ch in enumerate(col_str):
                row_y = start_row_y + r_idx * row_step
                bbox = draw.textbbox((0, 0), ch, font=c_font)
                cw = bbox[2] - bbox[0]
                ch_h = bbox[3] - bbox[1]
                draw_bold_text(
                    draw,
                    (col_x - cw / 2 - bbox[0], row_y - ch_h / 2 - bbox[1]),
                    ch,
                    c_font,
                    rgba_col,
                    stroke_width=max(1, int(c_font_size * 0.04)),
                )

    # 3. データネーム日付印 (丸枠 + 日付帯2本線 + 上段/中段/下段)
    elif stype == "datename":
        outer_r = size_px * 0.45
        draw.ellipse(
            [cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r],
            outline=rgba_col,
            width=border_w,
        )
        bar_half_h = outer_r * 0.25
        chord_x = math.sqrt(max(0, outer_r * outer_r - bar_half_h * bar_half_h))
        line_w = max(4, int(border_w * 0.7))
        draw.line([cx - chord_x + 4, cy - bar_half_h, cx + chord_x - 4, cy - bar_half_h], fill=rgba_col, width=line_w)
        draw.line([cx - chord_x + 4, cy + bar_half_h, cx + chord_x - 4, cy + bar_half_h], fill=rgba_col, width=line_w)

        top_text = (cfg.get("text") or "YDKリノベ").replace("\n", "")
        date_text = cfg.get("dateText") or get_today_stamp_date()
        bottom_text = cfg.get("bottomText") or "阿部"

        top_font = load_font(int(outer_r * 0.30), "serif")
        date_font = load_font(int(outer_r * 0.28), "sans")
        bot_font = load_font(int(outer_r * 0.38), "serif")

        for txt, fnt, ty in [
            (top_text, top_font, cy - outer_r * 0.54),
            (date_text, date_font, cy),
            (bottom_text, bot_font, cy + outer_r * 0.54),
        ]:
            bbox = draw.textbbox((0, 0), txt, font=fnt)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw_bold_text(draw, (cx - tw / 2 - bbox[0], ty - th / 2 - bbox[1]), txt, fnt, rgba_col, stroke_width=1)

    # 4. 認印・実印 (丸枠 + 縦書き1〜2列)
    elif stype == "mitome":
        outer_r = size_px * 0.44
        draw.ellipse(
            [cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r],
            outline=rgba_col,
            width=border_w,
        )
        cols = [c.strip() for c in (cfg.get("text") or "阿部").split("\n") if c.strip()]
        n_cols = max(1, len(cols))
        max_rows = max(len(c) for c in cols)
        font_size = int((outer_r * 1.48) / max(n_cols * 0.85, max_rows * 0.62))
        fnt = load_font(font_size, "serif")
        col_step = (outer_r * 1.05) / max(1, n_cols)
        start_col_x = cx + (col_step * (n_cols - 1)) / 2.0
        for c_idx, col_str in enumerate(cols):
            col_x = start_col_x - c_idx * col_step
            rows = len(col_str)
            row_step = (outer_r * 1.25) / max(1, rows)
            start_row_y = cy - (row_step * (rows - 1)) / 2.0
            for r_idx, ch in enumerate(col_str):
                row_y = start_row_y + r_idx * row_step
                bbox = draw.textbbox((0, 0), ch, font=fnt)
                cw, ch_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
                draw_bold_text(
                    draw,
                    (col_x - cw / 2 - bbox[0], row_y - ch_h / 2 - bbox[1]),
                    ch,
                    fnt,
                    rgba_col,
                    stroke_width=max(2, int(font_size * 0.045)),
                )

    # 5. 会社角印・ビジネス印 (角丸正方形枠 / 横長枠 / 丸枠)
    else:
        frame_fig = int(cfg.get("frameFigure", 0))
        direction = int(cfg.get("direction", 1))
        lines = [line.strip() for line in (cfg.get("text") or "株式会社\nYDK\nリノベー\nション印").split("\n") if line.strip()]
        if not lines:
            lines = ["YDK"]

        if frame_fig == 2:
            # 横長ビジネス印 (例: 請求書在中)
            pad_x = int(size_px * 0.05)
            pad_y = int(size_px * 0.28)
            draw.rounded_rectangle(
                [pad_x, pad_y, size_px - pad_x, size_px - pad_y],
                radius=int(size_px * 0.04),
                outline=rgba_col,
                width=border_w,
            )
            txt = "".join(lines)
            fnt = load_font(int((size_px - 2 * pad_x) / max(2, len(txt)) * 0.82), "serif")
            bbox = draw.textbbox((0, 0), txt, font=fnt)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw_bold_text(draw, (cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), txt, fnt, rgba_col, stroke_width=2)
        else:
            # 標準角印 (正方形 二重風または太枠)
            pad = int(size_px * 0.06)
            draw.rounded_rectangle(
                [pad, pad, size_px - pad, size_px - pad],
                radius=int(size_px * 0.03),
                outline=rgba_col,
                width=border_w,
            )
            inner_pad = pad + border_w + int(size_px * 0.035)
            inner_span = size_px - 2 * inner_pad

            if direction == 1:
                # 横書き複数段均等割付 (Makeestamp3Pro 4行角印互換)
                n_rows = len(lines)
                max_cols = max(len(r) for r in lines)
                cell_h = inner_span / max(1, n_rows)
                font_size = int(min(cell_h * 0.84, (inner_span / max(1, max_cols)) * 0.88))
                fnt = load_font(font_size, "serif")
                for r_idx, row_str in enumerate(lines):
                    row_y = inner_pad + (r_idx + 0.5) * cell_h
                    n_chars = len(row_str)
                    cell_w = inner_span / max(1, n_chars)
                    for c_idx, ch in enumerate(row_str):
                        col_x = inner_pad + (c_idx + 0.5) * cell_w
                        bbox = draw.textbbox((0, 0), ch, font=fnt)
                        cw, ch_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
                        draw_bold_text(
                            draw,
                            (col_x - cw / 2 - bbox[0], row_y - ch_h / 2 - bbox[1]),
                            ch,
                            fnt,
                            rgba_col,
                            stroke_width=max(2, int(font_size * 0.045)),
                        )
            else:
                # 縦書き複数列均等割付 (右から左)
                n_cols = len(lines)
                max_rows = max(len(c) for c in lines)
                cell_w = inner_span / max(1, n_cols)
                font_size = int(min(cell_w * 0.84, (inner_span / max(1, max_rows)) * 0.88))
                fnt = load_font(font_size, "serif")
                for c_idx, col_str in enumerate(lines):
                    col_x = size_px - inner_pad - (c_idx + 0.5) * cell_w
                    n_chars = len(col_str)
                    cell_h = inner_span / max(1, n_chars)
                    for r_idx, ch in enumerate(col_str):
                        row_y = inner_pad + (r_idx + 0.5) * cell_h
                        bbox = draw.textbbox((0, 0), ch, font=fnt)
                        cw, ch_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
                        draw_bold_text(
                            draw,
                            (col_x - cw / 2 - bbox[0], row_y - ch_h / 2 - bbox[1]),
                            ch,
                            fnt,
                            rgba_col,
                            stroke_width=max(2, int(font_size * 0.045)),
                        )

    img = apply_kasumi_effect(img, kasumi, cfg.get("text", "ydk"))
    return img


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="YDK Smart Seal Studio Headless Renderer")
    parser.add_argument("--list-presets", action="store_true", help="List available presets as JSON")
    parser.add_argument("--preset", type=str, default="preset-ydk-official-scan", help="Preset ID or alias")
    parser.add_argument("--config-json", type=str, default="", help="Custom StampConfig JSON override")
    parser.add_argument("--type", type=str, default="", help="Stamp type override (president|business|mitome|datename|user_scan)")
    parser.add_argument("--text", type=str, default="", help="Main text override")
    parser.add_argument("--center-text", type=str, default="", help="Center text for president stamp")
    parser.add_argument("--date-text", type=str, default="", help="Date text for datename stamp")
    parser.add_argument("--bottom-text", type=str, default="", help="Bottom text for datename stamp")
    parser.add_argument("--color", type=str, default="", help="Hex color override (e.g. ffd80016)")
    parser.add_argument("--size-mm", type=float, default=0.0, help="Size in mm override")
    parser.add_argument("--kasumi", type=int, default=-1, help="Kasumi (distress) level 0-100")
    parser.add_argument("--size-px", type=int, default=600, help="Output PNG pixel resolution")
    parser.add_argument("--out", type=str, default="", help="Output PNG file path (if omitted, prints base64 JSON)")
    args = parser.parse_args()

    if args.list_presets:
        presets_list = [
            {
                "id": p.get("id"),
                "name": p.get("name"),
                "type": p.get("type"),
                "sizeMm": p.get("pasteEdge", 18.0),
                "pasteEdge": p.get("pasteEdge", 18.0),
            }
            for p in PRESETS.values()
        ]
        print(json.dumps({"ok": True, "presets": presets_list}, ensure_ascii=False, indent=2))
        return

    cfg = resolve_preset(args.preset)
    if args.config_json:
        cfg.update(json.loads(args.config_json))
    if args.type:
        cfg["type"] = args.type
    if args.text:
        cfg["text"] = args.text.replace("\\n", "\n")
    if args.center_text:
        cfg["centerText"] = args.center_text.replace("\\n", "\n")
    if args.date_text:
        cfg["dateText"] = args.date_text
    if args.bottom_text:
        cfg["bottomText"] = args.bottom_text
    if args.color:
        cfg["color"] = args.color
    if args.size_mm > 0:
        cfg["pasteEdge"] = args.size_mm
    if args.kasumi >= 0:
        cfg["kasumiLevel"] = args.kasumi

    img = render_stamp_image(cfg, size_px=args.size_px)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    if args.out:
        out_abs = os.path.abspath(args.out)
        os.makedirs(os.path.dirname(out_abs), exist_ok=True)
        with open(out_abs, "wb") as f:
            f.write(png_bytes)
        print(
            json.dumps(
                {
                    "ok": True,
                    "out": out_abs,
                    "preset": cfg.get("id"),
                    "name": cfg.get("name"),
                    "type": cfg.get("type"),
                    "sizeMm": cfg.get("pasteEdge", 18.0),
                    "pasteEdgeMm": cfg.get("pasteEdge", 18.0),
                    "sizePx": args.size_px,
                    "widthPx": img.width,
                    "heightPx": img.height,
                    "bytes": len(png_bytes),
                },
                ensure_ascii=False,
            )
        )
    else:
        print(
            json.dumps(
                {
                    "ok": True,
                    "preset": cfg.get("id"),
                    "name": cfg.get("name"),
                    "type": cfg.get("type"),
                    "sizeMm": cfg.get("pasteEdge", 18.0),
                    "pasteEdgeMm": cfg.get("pasteEdge", 18.0),
                    "sizePx": args.size_px,
                    "widthPx": img.width,
                    "heightPx": img.height,
                    "base64": base64.b64encode(png_bytes).decode("ascii"),
                },
                ensure_ascii=False,
            )
        )


if __name__ == "__main__":
    main()


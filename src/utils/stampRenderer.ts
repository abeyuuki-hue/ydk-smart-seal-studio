/**
 * YDK スマート電子印鑑スタジオ (YDK Smart Seal Studio v1.0)
 * 高精細ベクター＆透過印影レンダリングエンジン
 * - 代表者印(丸印・回文・開始点・内円縦書き)
 * - 会社角印(角丸枠・均等割付stretchText・縦書き/横書き)
 * - 認印(丸印・小判印・縦/横)
 * - データネーム日付印(上下段＋日付バー)
 * - ユーザー印＆YDK実物透過印影画像（カラー変更・かすれ合成対応）
 * - リアル朱肉かすれ(clear1)・枠欠け(clipFrame)・にじみ(blur)完全再現
 */

import { PDFStamp, StampConfig } from '../types/stamp';
import { hexToRgb } from './stampTemplates';
import { OFFICIAL_YDK_SEAL_BASE64 } from './officialSealBase64';

// カスタム画像キャッシュ（同期描画対応）
const imageCache = new Map<string, HTMLImageElement>();

export const preloadStampImage = (dataUrl: string): Promise<HTMLImageElement> => {
  if (!dataUrl) return Promise.reject(new Error('Empty dataUrl'));
  if (imageCache.has(dataUrl)) {
    return Promise.resolve(imageCache.get(dataUrl)!);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(dataUrl, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
};

// 起動時に公式実物角印データを即時プリロード
if (typeof window !== 'undefined' && OFFICIAL_YDK_SEAL_BASE64) {
  preloadStampImage(OFFICIAL_YDK_SEAL_BASE64).catch(() => {});
}

/** シード付き擬似乱数生成器（ドラッグ中もかすれパターンがチラつかないように固定） */
function createSeededRandom(seedStr: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  }
  return function () {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 印章フォント名をブラウザ・OSの最適印章フォントへマッピング */
export const resolveSealFontFamily = (fontName: string): string => {
  switch (fontName) {
    case 'Ｃ＆Ｇ半漢印':
      return '"Ｃ＆Ｇ半漢印", "Yuji Syuku", "Zen Antique Soft", "HGS正楷書体-PRO", "HG正楷書体-PRO", "MS Mincho", "游明朝", serif';
    case 'Ｃ＆Ｇ P半古印':
      return '"Ｃ＆Ｇ P半古印", "Zen Antique Soft", "Yuji Syuku", "Shippori Mincho B1", "HG古印体", "MS Mincho", serif';
    case '篆書体風':
      return '"Yuji Boku", "Yuji Syuku", "Zen Antique Soft", "MS Mincho", serif';
    case '行書体風':
      return '"Yuji Syuku", "HGS行書体", "HG行書体", "MS Mincho", serif';
    case 'ＭＳ 明朝':
    case '游明朝':
      return `"${fontName}", "Shippori Mincho B1", "Noto Serif JP", "MS Mincho", serif`;
    case 'ＭＳ ゴシック':
    case '游ゴシック':
    default:
      return `"${fontName}", "Noto Sans JP", "MS Gothic", sans-serif`;
  }
};

/** 角丸矩形の安全描画ヘルパー */
const drawRoundedRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

/** 文字を描画（中抜き outlined 対応 ＆ 半古印・半漢印の太めストローク補強） */
const drawSealChar = (
  ctx: CanvasRenderingContext2D,
  ch: string,
  x: number,
  y: number,
  config: StampConfig,
  strokeBoost: number = 0
) => {
  if (config.outlined) {
    ctx.save();
    ctx.lineWidth = Math.max(1.2, strokeBoost || 1.8);
    ctx.strokeText(ch, x, y);
    ctx.restore();
  } else {
    ctx.fillText(ch, x, y);
    if (strokeBoost > 0) {
      ctx.save();
      ctx.lineWidth = strokeBoost;
      ctx.lineJoin = 'round';
      ctx.strokeText(ch, x, y);
      ctx.restore();
    }
  }
};

/**
 * キャンバスにスタンプを高精細描画
 */
export const drawStampOnCanvas = (
  canvas: HTMLCanvasElement,
  config: StampConfig,
  width: number = 220,
  height: number = 220,
  onAsyncLoad?: () => void
): HTMLCanvasElement => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const safeW = Math.max(24, Math.round(width));
  const safeH = Math.max(24, Math.round(height));
  if (canvas.width !== safeW) canvas.width = safeW;
  if (canvas.height !== safeH) canvas.height = safeH;
  ctx.clearRect(0, 0, safeW, safeH);

  const rgb = hexToRgb(config.color);
  const colorStr = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

  // 実物印影画像（customImageDataUrl）が設定されている場合
  if (config.customImageDataUrl) {
    const cached = imageCache.get(config.customImageDataUrl);
    if (cached) {
      // オフスクリーンで描画＆指定カラーに着色
      const offCanvas = document.createElement('canvas');
      offCanvas.width = safeW;
      offCanvas.height = safeH;
      const offCtx = offCanvas.getContext('2d');
      if (offCtx) {
        offCtx.save();
        const cx = safeW / 2;
        const cy = safeH / 2;
        offCtx.translate(cx, cy);
        if (config.localRotateDegree) {
          offCtx.rotate((config.localRotateDegree * Math.PI) / 180);
        }
        const pad = Math.min(safeW, safeH) * 0.04;
        offCtx.drawImage(
          cached,
          -safeW / 2 + pad,
          -safeH / 2 + pad,
          safeW - pad * 2,
          safeH - pad * 2
        );
        offCtx.restore();

        // ユーザーが朱色以外の色（青・黒・赤など）を選択した場合は着色適用
        const cleanHex = config.color.replace('#', '').slice(-6).toLowerCase();
        if (cleanHex !== 'd80016') {
          offCtx.save();
          offCtx.globalCompositeOperation = 'source-in';
          offCtx.fillStyle = colorStr;
          offCtx.fillRect(0, 0, safeW, safeH);
          offCtx.restore();
        }

        ctx.drawImage(offCanvas, 0, 0);
      }
      if (config.clear1 || config.clipFrame) {
        applyKasumiEffect(ctx, safeW, safeH, config);
      }
      return canvas;
    } else {
      preloadStampImage(config.customImageDataUrl)
        .then(() => {
          drawStampOnCanvas(canvas, config, safeW, safeH);
          if (onAsyncLoad) onAsyncLoad();
        })
        .catch(() => {});
      // ロード完了までの間も空白にならないようフォールバックでベクター角印を描画
    }
  }

  ctx.save();
  ctx.fillStyle = colorStr;
  ctx.strokeStyle = colorStr;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // にじみ（blur）効果
  if (config.blur > 0) {
    const blurPx = Math.min((config.blur / 100) * (Math.min(safeW, safeH) / 220) * 0.55, 1.4);
    if (blurPx >= 0.15) {
      ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
    }
  }

  // 印面回転 (localRotateDegree)
  const centerX = safeW / 2;
  const centerY = safeH / 2;
  ctx.translate(centerX, centerY);
  if (config.localRotateDegree) {
    ctx.rotate((config.localRotateDegree * Math.PI) / 180);
  }
  ctx.translate(-centerX, -centerY);

  switch (config.type) {
    case 'president':
      drawPresidentStamp(ctx, config, safeW, safeH);
      break;
    case 'business':
      drawBusinessStamp(ctx, config, safeW, safeH);
      break;
    case 'mitome':
      drawMitomeStamp(ctx, config, safeW, safeH);
      break;
    case 'datename':
      drawDateNameStamp(ctx, config, safeW, safeH);
      break;
    case 'user':
    default:
      drawUserStamp(ctx, config, safeW, safeH);
      break;
  }

  ctx.restore();

  // 朱肉かすれ (clear1) ＆ 枠欠け (clipFrame) の適用
  if (config.clear1 || config.clipFrame) {
    applyKasumiEffect(ctx, safeW, safeH, config);
  }

  return canvas;
};

/**
 * 1. 代表者印 (PresidentStamp - 二重丸枠 + 外周回文 + 開始点「・」 + 内円縦書き/横書き)
 */
const drawPresidentStamp = (
  ctx: CanvasRenderingContext2D,
  config: StampConfig,
  width: number,
  height: number
) => {
  const cx = width / 2;
  const cy = height / 2;
  const size = Math.min(width, height);
  const scaleFactor = size / 200;
  const outerLineWidth = Math.max(2, config.thickness * 1.4 * scaleFactor);
  const innerLineWidth = Math.max(1.2, outerLineWidth * 0.52);

  const outerRadius = size * 0.45 - outerLineWidth / 2;
  const innerRadius = outerRadius * 0.55;

  // 外円描画
  ctx.beginPath();
  ctx.lineWidth = outerLineWidth;
  ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 内円描画
  ctx.beginPath();
  ctx.lineWidth = innerLineWidth;
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.stroke();

  const fontFamily = resolveSealFontFamily(config.fontName);
  const strokeBoost = config.fontBold ? Math.max(0.6, 1.1 * scaleFactor) : 0;

  // 外周回文テキスト (config.text)
  const ringText = (config.text || '').replace(/\r?\n/g, '');
  if (ringText.length > 0) {
    const midRadius = (outerRadius + innerRadius) / 2;
    const ringBandWidth = outerRadius - innerRadius - outerLineWidth * 0.5 - innerLineWidth * 0.5;
    const ringFontSize = Math.min(
      ringBandWidth * 0.82 * (config.fontRatio / 110),
      ((2 * Math.PI * midRadius) / (ringText.length + (config.visibleStartPoint !== false ? 1 : 0))) * 0.92
    );

    ctx.save();
    ctx.font = `${config.fontBold ? 'bold ' : ''}${ringFontSize.toFixed(1)}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const hasDot = config.visibleStartPoint !== false;
    const totalSlots = ringText.length + (hasDot ? 1 : 0);
    const angleStep = (Math.PI * 2) / totalSlots;
    const adjustRad = ((config.outsideAdjustment || 0) * Math.PI) / 180;

    // 下部中央 (Math.PI / 2) に開始点「・」を置き、そこから時計回りに1周配置
    const baseAngle = Math.PI / 2 + adjustRad;

    if (hasDot) {
      ctx.save();
      const dotX = cx + midRadius * Math.cos(baseAngle);
      const dotY = cy + midRadius * Math.sin(baseAngle);
      ctx.beginPath();
      ctx.arc(dotX, dotY, Math.max(2, ringFontSize * 0.16), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < ringText.length; i++) {
      const slotIndex = hasDot ? i + 1 : i;
      const theta = baseAngle + slotIndex * angleStep;
      const x = cx + midRadius * Math.cos(theta);
      const y = cy + midRadius * Math.sin(theta);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(theta + Math.PI / 2);
      drawSealChar(ctx, ringText[i], 0, 0, config, strokeBoost * 0.7);
      ctx.restore();
    }
    ctx.restore();
  }

  // 内円の中央テキスト (config.centerText)
  const centerRaw = config.centerText || '代表取\n締役印';
  const columns = centerRaw.split(/\r?\n/).filter((l) => l.length > 0);
  if (columns.length > 0) {
    const cRatio = (config.centerRatio || 100) / 100;
    const innerBoxSize = innerRadius * 1.42;
    const isVertical = (config.centerDirection ?? 0) === 0;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isVertical) {
      const colCount = columns.length;
      const maxRowCount = Math.max(...columns.map((c) => c.length));
      const colStep = innerBoxSize / colCount;
      const rowStep = innerBoxSize / maxRowCount;
      const fontSize = Math.min(colStep, rowStep) * 0.88 * cRatio;

      ctx.font = `${config.fontBold ? 'bold ' : ''}${fontSize.toFixed(1)}px ${fontFamily}`;

      columns.forEach((colStr, colIdx) => {
        const colX = cx + innerBoxSize / 2 - colStep * (colIdx + 0.5);
        const chars = Array.from(colStr);
        const cRowStep = innerBoxSize / chars.length;
        chars.forEach((ch, rowIdx) => {
          const rowY = cy - innerBoxSize / 2 + cRowStep * (rowIdx + 0.5);
          drawSealChar(ctx, ch, colX, rowY, config, strokeBoost * 0.65);
        });
      });
    } else {
      const rowCount = columns.length;
      const maxColCount = Math.max(...columns.map((c) => c.length));
      const rowStep = innerBoxSize / rowCount;
      const colStep = innerBoxSize / maxColCount;
      const fontSize = Math.min(rowStep, colStep) * 0.88 * cRatio;

      ctx.font = `${config.fontBold ? 'bold ' : ''}${fontSize.toFixed(1)}px ${fontFamily}`;
      columns.forEach((lineStr, rowIdx) => {
        const rowY = cy - innerBoxSize / 2 + rowStep * (rowIdx + 0.5);
        const chars = Array.from(lineStr);
        const lColStep = innerBoxSize / chars.length;
        chars.forEach((ch, colIdx) => {
          const colX = cx - innerBoxSize / 2 + lColStep * (colIdx + 0.5);
          drawSealChar(ctx, ch, colX, rowY, config, strokeBoost * 0.65);
        });
      });
    }
    ctx.restore();
  }
};

/**
 * 2. 会社角印・ビジネス印 (BusinessStamp - 角丸枠 / 均等割付 stretchText / 縦書き・横書き)
 */
const drawBusinessStamp = (
  ctx: CanvasRenderingContext2D,
  config: StampConfig,
  width: number,
  height: number
) => {
  const cx = width / 2;
  const cy = height / 2;
  const size = Math.min(width, height);
  const scaleFactor = size / 200;
  const lineWidth = Math.max(2, config.thickness * 1.65 * scaleFactor);

  const frameType = config.frameFigure ?? 0; // 0: 正方形角印, 1: 丸印, 2: 長方形枠, 3: 枠なし
  const margin = size * 0.055 + lineWidth / 2;

  let boxW = width - margin * 2;
  let boxH = height - margin * 2;

  if (frameType === 2) {
    if ((config.direction ?? 1) === 1) {
      boxH = height * 0.46;
    } else {
      boxW = width * 0.46;
    }
  }

  const boxLeft = cx - boxW / 2;
  const boxTop = cy - boxH / 2;
  const cornerRadius = Math.min(boxW, boxH) * 0.065;

  // 外枠の描画
  ctx.lineWidth = lineWidth;
  if (frameType === 0 || frameType === 2) {
    drawRoundedRectPath(ctx, boxLeft, boxTop, boxW, boxH, cornerRadius);
    ctx.stroke();
  } else if (frameType === 1) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, boxW / 2, boxH / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const lines = (config.text || '').split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return;

  const fontFamily = resolveSealFontFamily(config.fontName);
  const innerPad = lineWidth * 0.75 + size * 0.02;
  const contentW = boxW - innerPad * 2;
  const contentH = boxH - innerPad * 2;
  const isHorizontal = (config.direction ?? 1) === 1;
  const ratioScale = (config.fontRatio || 100) / 100;
  const strokeBoost = config.fontBold ? Math.max(0.8, 1.5 * scaleFactor) : Math.max(0.4, 0.8 * scaleFactor);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (isHorizontal) {
    const rowCount = lines.length;
    const rowH = contentH / rowCount;

    lines.forEach((lineStr, rowIdx) => {
      const chars = Array.from(lineStr);
      const charCount = chars.length;
      if (charCount === 0) return;

      const rowCenterY = cy - contentH / 2 + rowH * (rowIdx + 0.5);
      const cellW = contentW / charCount;
      const baseFontSize = Math.min(rowH * 0.92, (contentW / Math.max(charCount, 3)) * 1.05) * ratioScale;

      ctx.font = `${config.fontBold ? 'bold ' : ''}${baseFontSize.toFixed(1)}px ${fontFamily}`;

      chars.forEach((ch, cIdx) => {
        const charCenterX =
          config.stretchText && charCount > 1
            ? cx - contentW / 2 + cellW * (cIdx + 0.5)
            : cx + (cIdx - (charCount - 1) / 2) * (baseFontSize * 0.95);

        ctx.save();
        ctx.translate(charCenterX, rowCenterY);
        if (config.stretchText) {
          const scaleX = Math.min(1.32, Math.max(0.78, (cellW / baseFontSize) * 0.96));
          const scaleY = Math.min(1.18, Math.max(0.82, (rowH / baseFontSize) * 0.92));
          ctx.scale(scaleX, scaleY);
        }
        drawSealChar(ctx, ch, 0, 0, config, strokeBoost);
        ctx.restore();
      });
    });
  } else {
    const colCount = lines.length;
    const colW = contentW / colCount;

    lines.forEach((colStr, colIdx) => {
      const chars = Array.from(colStr);
      const charCount = chars.length;
      if (charCount === 0) return;

      const colCenterX = cx + contentW / 2 - colW * (colIdx + 0.5);
      const cellH = contentH / charCount;
      const baseFontSize = Math.min(colW * 0.92, cellH * 0.95) * ratioScale;

      ctx.font = `${config.fontBold ? 'bold ' : ''}${baseFontSize.toFixed(1)}px ${fontFamily}`;

      chars.forEach((ch, rIdx) => {
        const charCenterY =
          config.stretchText && charCount > 1
            ? cy - contentH / 2 + cellH * (rIdx + 0.5)
            : cy + (rIdx - (charCount - 1) / 2) * (baseFontSize * 0.95);

        ctx.save();
        ctx.translate(colCenterX, charCenterY);
        if (config.stretchText) {
          const scaleX = Math.min(1.25, Math.max(0.8, (colW / baseFontSize) * 0.92));
          const scaleY = Math.min(1.25, Math.max(0.8, (cellH / baseFontSize) * 0.94));
          ctx.scale(scaleX, scaleY);
        }
        drawSealChar(ctx, ch, 0, 0, config, strokeBoost);
        ctx.restore();
      });
    });
  }

  ctx.restore();
};

/**
 * 3. 認印・実印 (MitomeStamp - 丸印 / 小判印, 縦書き・横書き)
 */
const drawMitomeStamp = (
  ctx: CanvasRenderingContext2D,
  config: StampConfig,
  width: number,
  height: number
) => {
  const cx = width / 2;
  const cy = height / 2;
  const size = Math.min(width, height);
  const scaleFactor = size / 200;
  const lineWidth = Math.max(2, config.thickness * 1.5 * scaleFactor);

  const isOval = config.frameFigure === 1;
  const rx = isOval ? size * 0.33 : size * 0.44 - lineWidth / 2;
  const ry = size * 0.44 - lineWidth / 2;

  if (config.frameFigure !== 3) {
    ctx.beginPath();
    ctx.lineWidth = lineWidth;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const lines = (config.text || '阿部').split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return;

  const fontFamily = resolveSealFontFamily(config.fontName);
  const isVertical = (config.direction ?? 0) === 0;
  const ratioScale = (config.fontRatio || 130) / 130;
  const strokeBoost = config.fontBold ? Math.max(0.8, 1.4 * scaleFactor) : Math.max(0.4, 0.7 * scaleFactor);

  const innerW = rx * 1.48;
  const innerH = ry * 1.54;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (isVertical) {
    const colCount = lines.length;
    const colStep = innerW / colCount;

    lines.forEach((colStr, colIdx) => {
      const chars = Array.from(colStr);
      const rowCount = chars.length;
      if (rowCount === 0) return;

      const colX = colCount === 1 ? cx : cx + innerW / 2 - colStep * (colIdx + 0.5);
      const rowStep = innerH / rowCount;
      const fontSize = Math.min(colStep * 0.98, rowStep * 0.92) * ratioScale;

      ctx.font = `${config.fontBold ? 'bold ' : ''}${fontSize.toFixed(1)}px ${fontFamily}`;

      chars.forEach((ch, rIdx) => {
        const rowY =
          rowCount === 1
            ? cy
            : cy - (innerH * 0.88) / 2 + ((innerH * 0.88) / rowCount) * (rIdx + 0.5);
        drawSealChar(ctx, ch, colX, rowY, config, strokeBoost);
      });
    });
  } else {
    const rowCount = lines.length;
    const rowStep = innerH / rowCount;

    lines.forEach((lineStr, rowIdx) => {
      const chars = Array.from(lineStr);
      const colCount = chars.length;
      if (colCount === 0) return;

      const rowY = rowCount === 1 ? cy : cy - innerH / 2 + rowStep * (rowIdx + 0.5);
      const colStep = innerW / colCount;
      const fontSize = Math.min(rowStep * 0.95, colStep * 0.95) * ratioScale;

      ctx.font = `${config.fontBold ? 'bold ' : ''}${fontSize.toFixed(1)}px ${fontFamily}`;

      chars.forEach((ch, cIdx) => {
        const colX =
          colCount === 1
            ? cx
            : cx - (innerW * 0.88) / 2 + ((innerW * 0.88) / colCount) * (cIdx + 0.5);
        drawSealChar(ctx, ch, colX, rowY, config, strokeBoost);
      });
    });
  }

  ctx.restore();
};

/**
 * 4. データネーム日付印 (DateNameStamp - 外枠 + 上下水平仕切り線 + 上段・日付・下段)
 */
const drawDateNameStamp = (
  ctx: CanvasRenderingContext2D,
  config: StampConfig,
  width: number,
  height: number
) => {
  const cx = width / 2;
  const cy = height / 2;
  const size = Math.min(width, height);
  const scaleFactor = size / 200;
  const lineWidth = Math.max(2, config.thickness * 1.45 * scaleFactor);
  const radius = size * 0.44 - lineWidth / 2;
  const isSquare = config.frameFigure === 1;

  ctx.lineWidth = lineWidth;
  if (isSquare) {
    const boxSize = radius * 2;
    drawRoundedRectPath(ctx, cx - radius, cy - radius, boxSize, boxSize, boxSize * 0.08);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  const barOffset = radius * 0.28;
  const chordHalf = isSquare
    ? radius - lineWidth * 0.3
    : Math.sqrt(Math.max(0, radius * radius - barOffset * barOffset)) - lineWidth * 0.3;

  ctx.beginPath();
  ctx.lineWidth = Math.max(1.5, lineWidth * 0.75);
  ctx.moveTo(cx - chordHalf, cy - barOffset);
  ctx.lineTo(cx + chordHalf, cy - barOffset);
  ctx.moveTo(cx - chordHalf, cy + barOffset);
  ctx.lineTo(cx + chordHalf, cy + barOffset);
  ctx.stroke();

  const fontFamily = resolveSealFontFamily(config.fontName);
  const ratioScale = (config.fontRatio || 100) / 100;
  const strokeBoost = config.fontBold ? Math.max(0.5, 0.9 * scaleFactor) : 0;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const topText = config.text || 'YDKリノベ';
  const topFontSize = radius * 0.31 * ratioScale;
  ctx.font = `${config.fontBold ? 'bold ' : ''}${topFontSize.toFixed(1)}px ${fontFamily}`;
  drawSealChar(ctx, topText, cx, cy - radius * 0.6, config, strokeBoost);

  const dateStr = config.dateText || "'26.10.16";
  const dateFontSize = radius * 0.34 * ratioScale;
  ctx.font = `bold ${dateFontSize.toFixed(1)}px "Noto Sans JP", "MS Gothic", sans-serif`;
  drawSealChar(ctx, dateStr, cx, cy, config, 0);

  const bottomText = config.bottomText || '阿部';
  const bottomFontSize = radius * 0.35 * ratioScale;
  ctx.font = `${config.fontBold ? 'bold ' : ''}${bottomFontSize.toFixed(1)}px ${fontFamily}`;
  drawSealChar(ctx, bottomText, cx, cy + radius * 0.6, config, strokeBoost);

  ctx.restore();
};

/**
 * 5. ユーザー印 (UserStamp)
 */
const drawUserStamp = (
  ctx: CanvasRenderingContext2D,
  config: StampConfig,
  width: number,
  height: number
) => {
  if (config.frameFigure !== undefined && config.frameFigure !== 3) {
    drawBusinessStamp(ctx, config, width, height);
    return;
  }

  // 複数行の角印テキストの場合は角印レイアウトで美しく描画
  const lines = (config.text || '').split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return;

  if (lines.length >= 2) {
    drawBusinessStamp(ctx, { ...config, frameFigure: 0 }, width, height);
    return;
  }

  const cx = width / 2;
  const cy = height / 2;
  const size = Math.min(width, height);
  const fontFamily = resolveSealFontFamily(config.fontName);

  const fontSize = (size * (config.fontRatio || 80)) / 180;
  ctx.save();
  ctx.font = `${config.fontBold ? 'bold ' : ''}${fontSize.toFixed(1)}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lineStep = fontSize * 1.15;
  const startY = cy - ((lines.length - 1) * lineStep) / 2;
  lines.forEach((line, idx) => {
    drawSealChar(ctx, line, cx, startY + idx * lineStep, config, config.fontBold ? 1.0 : 0);
  });
  ctx.restore();
};

/**
 * リアル朱肉かすれ効果 (clear1) ＆ 枠欠け効果 (clipFrame)
 */
const applyKasumiEffect = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: StampConfig
) => {
  const level = config.clear1 ? (config.kasumiLevel ?? 30) : 0;
  if (level <= 0 && !config.clipFrame) return;

  const rand = createSeededRandom(`${config.id}-${config.text}-${config.centerText || ''}`);

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  const speckleCount = Math.floor(width * height * (level / 100) * 0.065);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  for (let i = 0; i < speckleCount; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = (0.4 + rand() * 0.9) * (Math.min(width, height) / 200);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const patchCount = Math.floor((level / 100) * 45);
  for (let i = 0; i < patchCount; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const rx = (1.5 + rand() * 4.5) * (width / 200);
    const ry = (0.5 + rand() * 1.8) * (height / 200);
    const angle = rand() * Math.PI;
    ctx.fillStyle = `rgba(0, 0, 0, ${(0.25 + rand() * 0.55).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
    ctx.fill();
  }

  if (config.clipFrame) {
    const nickCount = 8;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    for (let i = 0; i < nickCount; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.min(width, height) * (0.42 + rand() * 0.05);
      const nx = width / 2 + Math.cos(angle) * dist;
      const ny = height / 2 + Math.sin(angle) * dist;
      const nr = (1.0 + rand() * 1.8) * (Math.min(width, height) / 200);
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
};

/**
 * スタンプ設定から即座に透過PNG DataURLを生成（同期・非同期両対応）
 */
export const renderStampToDataUrlSync = (
  config: StampConfig,
  sizePx: number = 240
): string => {
  const offscreen = document.createElement('canvas');
  drawStampOnCanvas(offscreen, config, sizePx, sizePx);
  try {
    return offscreen.toDataURL('image/png');
  } catch {
    return '';
  }
};

/**
 * PDF埋め込み用の高解像度スタンプCanvasを生成（実寸ptの4倍解像度でクッキリ描画）
 */
export const generateStampCanvas = async (stamp: PDFStamp): Promise<HTMLCanvasElement> => {
  if (stamp.config.customImageDataUrl) {
    try {
      await preloadStampImage(stamp.config.customImageDataUrl);
    } catch {
      // ignore
    }
  }
  const canvas = document.createElement('canvas');
  const renderScale = 4; // 300DPI相当の高解像度出力
  const pxW = Math.max(240, Math.round(stamp.position.width * renderScale));
  const pxH = Math.max(240, Math.round(stamp.position.height * renderScale));
  return drawStampOnCanvas(canvas, stamp.config, pxW, pxH);
};

/**
 * 印影を透過PNG DataURLとして取得
 */
export const exportStampAsPngDataUrl = async (
  config: StampConfig,
  sizePx: number = 400
): Promise<string> => {
  if (config.customImageDataUrl) {
    try {
      await preloadStampImage(config.customImageDataUrl);
    } catch {
      // ignore
    }
  }
  const canvas = document.createElement('canvas');
  drawStampOnCanvas(canvas, config, sizePx, sizePx);
  return canvas.toDataURL('image/png');
};
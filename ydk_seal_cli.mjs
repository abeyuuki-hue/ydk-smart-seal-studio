#!/usr/bin/env node
/**
 * YDK Smart Seal Studio - Agent Headless CLI (ydk_seal_cli.mjs)
 * =============================================================
 * AIエージェント（Antigravity / PC1 CLI / PC2 AI事務員 / invoiceAgent / Subagent）から
 * ブラウザを開かずに0.5秒で高精細（600DPI）の電子印鑑生成・PDF座標自動検出・自動押印を実行するCLIツール。
 *
 * 主なサブコマンド:
 *   1. presets                         : 利用可能な全印鑑プリセット一覧をJSON/表形式で出力
 *   2. image   --preset <id> --out <p> : 単体の透過PNG印影画像（600DPI）を生成
 *   3. inspect --pdf <path>            : PDF内のテキスト要素と座標（pt / mm）を抽出し、押印アンカー候補を表示
 *   4. stamp   --pdf <in> --out <out>  : PDFへ1個または複数の電子印鑑を押印して出力（アンカー自動検索・mm指定・一括JSON対応）
 *   5. sample  --out <out.pdf>         : テスト・デモ用のサンプル請求書PDFを生成し、会社実印＋担当データ印を自動押印
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RENDERER_PY = path.join(__dirname, 'ydk_seal_renderer.py');
const PT_PER_MM = 72 / 25.4; // 1mm = 2.83464567 pt
const MM_PER_PT = 25.4 / 72;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const eqIdx = token.indexOf('=');
      if (eqIdx !== -1) {
        const k = token.slice(2, eqIdx);
        const v = token.slice(eqIdx + 1);
        args[k] = v;
      } else {
        const k = token.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          args[k] = next;
          i++;
        } else {
          args[k] = true;
        }
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function runPythonRenderer(pyArgs) {
  const pythonCandidates = [
    'python',
    'C:\\YDK_Local_Dev\\.venv\\Scripts\\python.exe',
  ];
  let lastErr = null;
  for (const pyExe of pythonCandidates) {
    try {
      const stdout = execFileSync(pyExe, [RENDERER_PY, ...pyArgs], {
        encoding: 'utf8',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return JSON.parse(stdout.trim());
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Python renderer failed: ${lastErr?.stderr || lastErr?.message}`);
}

/**
 * PDFからテキスト要素と座標一覧を抽出 (pdfjs-dist legacy build)
 */
async function extractPdfTextItems(pdfPath) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  const pages = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const items = [];

    for (const item of textContent.items) {
      const str = (item.str || '').trim();
      if (!str) continue;
      // item.transform = [scaleX, skewY, skewX, scaleY, tx, ty] (PDF coordinates: bottom-left origin)
      const tx = item.transform[4];
      const ty = item.transform[5];
      const wPt = item.width || str.length * 8;
      const hPt = Math.abs(item.transform[3]) || item.height || 10;
      // Top-left origin coordinates (used by UI and --x-mm / --y-mm)
      const xTopLeftPt = tx;
      const yTopLeftPt = viewport.height - ty - hPt;

      items.push({
        text: str,
        page: p,
        xPt: Number(xTopLeftPt.toFixed(2)),
        yPt: Number(yTopLeftPt.toFixed(2)),
        widthPt: Number(wPt.toFixed(2)),
        heightPt: Number(hPt.toFixed(2)),
        xMm: Number((xTopLeftPt * MM_PER_PT).toFixed(1)),
        yMm: Number((yTopLeftPt * MM_PER_PT).toFixed(1)),
        widthMm: Number((wPt * MM_PER_PT).toFixed(1)),
        heightMm: Number((hPt * MM_PER_PT).toFixed(1)),
      });
    }

    pages.push({
      page: p,
      widthPt: Number(viewport.width.toFixed(2)),
      heightPt: Number(viewport.height.toFixed(2)),
      widthMm: Number((viewport.width * MM_PER_PT).toFixed(1)),
      heightMm: Number((viewport.height * MM_PER_PT).toFixed(1)),
      items,
    });
  }
  return pages;
}

/**
 * アンカー文字列またはスマート位置名から押印座標 (top-left origin pt) を解決する
 */
function resolveStampPosition({
  pageInfo,
  stampWidthPt,
  stampHeightPt,
  anchor,
  anchorOffsetXMm = 0,
  anchorOffsetYMm = 0,
  pos,
  xMm,
  yMm,
  xPt,
  yPt,
}) {
  const pageW = pageInfo.widthPt;
  const pageH = pageInfo.heightPt;

  // 1. 明示的なmm指定
  if (xMm !== undefined && yMm !== undefined) {
    return {
      xPt: Number(xMm) * PT_PER_MM,
      yPt: Number(yMm) * PT_PER_MM,
      resolvedBy: `explicit-mm(${xMm}mm, ${yMm}mm)`,
    };
  }

  // 2. 明示的なpt指定
  if (xPt !== undefined && yPt !== undefined) {
    return {
      xPt: Number(xPt),
      yPt: Number(yPt),
      resolvedBy: `explicit-pt(${xPt}pt, ${yPt}pt)`,
    };
  }

  // 3. アンカー文字列検索 (--anchor "印" や --anchor "株式会社YDK" 等)
  if (anchor) {
    const keywords = String(anchor)
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const boxHeaderRegex = /^(approved|checked|staff|承認|決裁|審査|検印|確認|担当|係印|作成)$/i;

    for (const kw of keywords) {
      const hit = pageInfo.items.find((it) => it.text.includes(kw));
      if (hit) {
        const idx = hit.text.indexOf(kw);
        const totalLen = Math.max(1, hit.text.length);
        // テキストアイテム内でのキーワード中心位置比率を算出
        const kwCenterRatio = (idx + kw.length / 2) / totalLen;
        let centerX = hit.xPt + hit.widthPt * kwCenterRatio;
        let centerY = hit.yPt + hit.heightPt / 2;

        // 検印枠ヘッダー（Approved / 承認 / 担当 等）の場合はラベル真下の枠中央に配置
        if (boxHeaderRegex.test(kw) && Number(anchorOffsetYMm) === 0) {
          centerY = hit.yPt + hit.heightPt + stampHeightPt * 0.48;
        } else if (
          kw.length >= 5 &&
          !['[SEAL]', '(SEAL)', '(印)', '（印）'].includes(kw) &&
          !boxHeaderRegex.test(kw) &&
          Number(anchorOffsetXMm) === 0
        ) {
          // 会社名自体をアンカーにした場合は文字列の右端付近に重ねる
          centerX =
            hit.xPt +
            hit.widthPt * ((idx + kw.length) / totalLen) +
            stampWidthPt * 0.15;
        }

        const finalX =
          centerX - stampWidthPt / 2 + Number(anchorOffsetXMm) * PT_PER_MM;
        const finalY =
          centerY - stampHeightPt / 2 + Number(anchorOffsetYMm) * PT_PER_MM;
        return {
          xPt: Math.max(5, Math.min(pageW - stampWidthPt - 5, finalX)),
          yPt: Math.max(5, Math.min(pageH - stampHeightPt - 5, finalY)),
          resolvedBy: `anchor("${kw}" @ ${hit.xMm}mm, ${hit.yMm}mm)`,
        };
      }
    }
  }

  // 4. 名前付き領域または自動アンカー検出 (--pos auto / company-block / approval-right / bottom-right 等)
  const posKey = (pos || 'auto').toLowerCase();
  if (posKey === 'auto') {
    const autoKeywords = [
      '㊞',
      '(印)',
      '（印）',
      '印',
      '株式会社YDK',
      'YDKリノベーション',
      'やればできるこJAPAN',
      '阿部裕樹',
      '阿部 裕樹',
    ];
    for (const kw of autoKeywords) {
      const hit = pageInfo.items.find((it) => it.text.includes(kw));
      if (hit) {
        let centerX = hit.xPt + hit.widthPt / 2;
        let centerY = hit.yPt + hit.heightPt / 2;
        if (hit.text.length >= 4 && !['(印)', '（印）'].includes(hit.text)) {
          centerX = hit.xPt + hit.widthPt + stampWidthPt * 0.2;
        }
        return {
          xPt: Math.max(5, Math.min(pageW - stampWidthPt - 5, centerX - stampWidthPt / 2)),
          yPt: Math.max(5, Math.min(pageH - stampHeightPt - 5, centerY - stampHeightPt / 2)),
          resolvedBy: `auto-anchor("${kw}" @ ${hit.xMm}mm, ${hit.yMm}mm)`,
        };
      }
    }
  }

  const NamedPositions = {
    'company-block': { xRatio: 0.78, yRatio: 0.22 }, // 請求書右上の発行者ブロック付近
    'top-right': { xRatio: 0.80, yRatio: 0.16 },
    'approval-1': { xRatio: 0.65, yRatio: 0.28 },
    'approval-2': { xRatio: 0.74, yRatio: 0.28 },
    'approval-3': { xRatio: 0.83, yRatio: 0.28 },
    'center-right': { xRatio: 0.78, yRatio: 0.45 },
    'bottom-right': { xRatio: 0.78, yRatio: 0.78 },
    'bottom-left': { xRatio: 0.12, yRatio: 0.78 },
  };

  const chosen = NamedPositions[posKey] || NamedPositions['company-block'];
  return {
    xPt: pageW * chosen.xRatio,
    yPt: pageH * chosen.yRatio,
    resolvedBy: `named-pos(${posKey})`,
  };
}

/**
 * テスト・デモ用のサンプル請求書PDFを生成
 */
async function createSampleInvoicePdf(targetPath) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('INVOICE / SEIKYUSHO (YDK Smart Seal Studio)', {
    x: 50,
    y: 780,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  page.drawText('To: Comfort Co., Ltd. / Fujikizai Group', {
    x: 50,
    y: 735,
    size: 12,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText('Total Amount: JPY 44,000 (Tax Included)', {
    x: 50,
    y: 700,
    size: 14,
    font: fontBold,
    color: rgb(0.75, 0.1, 0.1),
  });

  // 右上・発行元ブロック
  page.drawText('YDK Renovation Inc. / Yarebadekiruko JAPAN Inc.', {
    x: 310,
    y: 735,
    size: 10,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.15),
  });
  page.drawText('Representative: Yuuki Abe  [SEAL]', {
    x: 310,
    y: 715,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  // 検印枠 (Approval boxes)
  const boxTopY = 640;
  const boxSize = 52;
  const labels = ['Approved', 'Checked', 'Staff'];
  labels.forEach((lbl, idx) => {
    const bx = 360 + idx * boxSize;
    page.drawRectangle({
      x: bx,
      y: boxTopY - boxSize,
      width: boxSize,
      height: boxSize,
      borderColor: rgb(0.4, 0.4, 0.4),
      borderWidth: 1,
    });
    page.drawText(lbl, {
      x: bx + 6,
      y: boxTopY - 12,
      size: 8,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  });

  const bytes = await pdfDoc.save();
  fs.mkdirSync(path.dirname(path.resolve(targetPath)), { recursive: true });
  fs.writeFileSync(targetPath, bytes);
  return targetPath;
}

/**
 * メイン処理
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const subcmd = (args._[0] || 'help').toLowerCase();

  if (subcmd === 'presets' || subcmd === 'list') {
    const res = runPythonRenderer(['--list-presets']);
    if (args.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log('=== YDK スマート電子印鑑スタジオ 利用可能プリセット一覧 ===');
      for (const p of res.presets) {
        console.log(
          `- ${p.id.padEnd(28)} | ${p.name} (${p.type}, ${p.sizeMm}mm)`
        );
      }
    }
    return;
  }

  if (subcmd === 'image' || subcmd === 'render') {
    const outPath =
      args.out ||
      path.join(__dirname, 'output_seal.png');
    const pyArgs = ['--out', path.resolve(outPath)];
    if (args.preset) pyArgs.push('--preset', String(args.preset));
    if (args.type) pyArgs.push('--type', String(args.type));
    if (args.text || args.top) pyArgs.push('--text', String(args.text || args.top));
    if (args.date || args['date-text']) pyArgs.push('--date-text', String(args.date || args['date-text']));
    if (args.bottom || args['bottom-text']) pyArgs.push('--bottom-text', String(args.bottom || args['bottom-text']));
    if (args.inner || args['center-text']) pyArgs.push('--center-text', String(args.inner || args['center-text']));
    if (args['size-mm']) pyArgs.push('--size-mm', String(args['size-mm']));
    if (args.color) pyArgs.push('--color', String(args.color));
    if (args.kasumi !== undefined) pyArgs.push('--kasumi', String(args.kasumi));

    const res = runPythonRenderer(pyArgs);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (subcmd === 'inspect') {
    const pdfPath = args.pdf || args._[1];
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      throw new Error(`--pdf <path> に有効なPDFファイルを指定してください: ${pdfPath}`);
    }
    const pages = await extractPdfTextItems(path.resolve(pdfPath));
    console.log(JSON.stringify({ ok: true, pdf: path.resolve(pdfPath), pages }, null, 2));
    return;
  }

  if (subcmd === 'sample') {
    const outPdf = path.resolve(
      args.out || path.join(__dirname, 'sample_ydk_stamped_invoice.pdf')
    );
    const rawPdf = outPdf.replace(/\.pdf$/i, '_raw.pdf');
    await createSampleInvoicePdf(rawPdf);

    // サンプルには「①株式会社YDK公式実印スキャン (21mm)」「②阿部裕樹データ印 (15mm)」「③承認済角印 (16mm)」の3つを同時押印
    const stampsSpec = [
      {
        preset: 'preset-ydk-official-scan',
        anchor: '[SEAL]',
        offsetXMm: 4,
        offsetYMm: 0,
      },
      {
        preset: 'preset-ydk-datename',
        anchor: 'Staff',
        offsetXMm: 3,
        offsetYMm: 0,
      },
      {
        preset: 'preset-approved',
        anchor: 'Approved',
        offsetXMm: 1,
        offsetYMm: 0,
      },
    ];

    args.pdf = rawPdf;
    args.out = outPdf;
    args.stamps = JSON.stringify(stampsSpec);
    // fallthrough to stamp logic below
  }

  if (subcmd === 'stamp' || subcmd === 'sample') {
    let inputPdf = args.pdf || args._[1];
    if (args.sample && !inputPdf) {
      inputPdf = path.join(__dirname, 'temp_sample_input.pdf');
      await createSampleInvoicePdf(inputPdf);
    }
    if (!inputPdf || !fs.existsSync(inputPdf)) {
      throw new Error(`入力PDFが見つかりません (--pdf <path>): ${inputPdf}`);
    }
    const resolvedIn = path.resolve(inputPdf);
    const resolvedOut = path.resolve(
      args.out || resolvedIn.replace(/\.pdf$/i, '_捺印済.pdf')
    );

    // 複数スタンプ指定 (--stamps '[...]') または単一スタンプ指定を配列に正規化
    let stampList = [];
    if (args.stamps) {
      stampList = JSON.parse(String(args.stamps));
    } else {
      stampList.push({
        preset: args.preset || 'preset-ydk-official-scan',
        type: args.type,
        text: args.text || args.top,
        date: args.date || args['date-text'],
        bottom: args.bottom || args['bottom-text'],
        inner: args.inner || args['center-text'],
        sizeMm: args['size-mm'] ? Number(args['size-mm']) : undefined,
        color: args.color,
        kasumi: args.kasumi !== undefined ? Number(args.kasumi) : undefined,
        page: args.page ? Number(args.page) : 1,
        anchor: args.anchor,
        offsetXMm: args['offset-x-mm'] ? Number(args['offset-x-mm']) : 0,
        offsetYMm: args['offset-y-mm'] ? Number(args['offset-y-mm']) : 0,
        pos: args.pos || 'auto',
        xMm: args['x-mm'] !== undefined ? Number(args['x-mm']) : undefined,
        yMm: args['y-mm'] !== undefined ? Number(args['y-mm']) : undefined,
        xPt: args.x !== undefined ? Number(args.x) : undefined,
        yPt: args.y !== undefined ? Number(args.y) : undefined,
        opacity: args.opacity !== undefined ? Number(args.opacity) : 0.92,
      });
    }

    // PDFのテキスト座標を事前抽出
    let extractedPages = [];
    try {
      extractedPages = await extractPdfTextItems(resolvedIn);
    } catch {
      extractedPages = [];
    }

    const pdfBytes = fs.readFileSync(resolvedIn);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const appliedStamps = [];

    for (let idx = 0; idx < stampList.length; idx++) {
      const spec = stampList[idx];
      const tempPng = path.join(
        __dirname,
        `.tmp_seal_${process.pid}_${idx}.png`
      );
      const pyArgs = ['--out', tempPng];
      if (spec.preset) pyArgs.push('--preset', String(spec.preset));
      if (spec.type) pyArgs.push('--type', String(spec.type));
      if (spec.text) pyArgs.push('--text', String(spec.text));
      if (spec.date) pyArgs.push('--date-text', String(spec.date));
      if (spec.bottom) pyArgs.push('--bottom-text', String(spec.bottom));
      if (spec.inner) pyArgs.push('--center-text', String(spec.inner));
      if (spec.sizeMm) pyArgs.push('--size-mm', String(spec.sizeMm));
      if (spec.color) pyArgs.push('--color', String(spec.color));
      if (spec.kasumi !== undefined) pyArgs.push('--kasumi', String(spec.kasumi));

      const renderMeta = runPythonRenderer(pyArgs);
      const pngBytes = fs.readFileSync(tempPng);
      try {
        fs.unlinkSync(tempPng);
      } catch {}

      const pngImage = await pdfDoc.embedPng(pngBytes);
      const pageNum = Math.max(1, Math.min(pages.length, Number(spec.page || 1)));
      const pdfPage = pages[pageNum - 1];
      const { width: pageW, height: pageH } = pdfPage.getSize();

      const sizeMm = Number(spec.sizeMm || renderMeta.sizeMm || renderMeta.pasteEdgeMm || 21);
      const wPx = Number(renderMeta.widthPx || renderMeta.sizePx || 600);
      const hPx = Number(renderMeta.heightPx || renderMeta.sizePx || 600);
      const aspect = wPx > 0 ? hPx / wPx : 1.0;
      const stampWidthPt = sizeMm * PT_PER_MM;
      const stampHeightPt = stampWidthPt * aspect;

      const pageInfo = extractedPages[pageNum - 1] || {
        page: pageNum,
        widthPt: pageW,
        heightPt: pageH,
        items: [],
      };

      const posResult = resolveStampPosition({
        pageInfo,
        stampWidthPt,
        stampHeightPt,
        anchor: spec.anchor,
        anchorOffsetXMm: spec.offsetXMm || 0,
        anchorOffsetYMm: spec.offsetYMm || 0,
        pos: spec.pos || 'auto',
        xMm: spec.xMm,
        yMm: spec.yMm,
        xPt: spec.xPt,
        yPt: spec.yPt,
      });

      // Top-left origin -> PDF bottom-left origin
      const pdfX = posResult.xPt;
      const pdfY = pageH - posResult.yPt - stampHeightPt;

      pdfPage.drawImage(pngImage, {
        x: pdfX,
        y: pdfY,
        width: stampWidthPt,
        height: stampHeightPt,
        opacity: spec.opacity !== undefined ? Number(spec.opacity) : 0.92,
      });

      appliedStamps.push({
        index: idx + 1,
        preset: renderMeta.preset,
        type: renderMeta.type,
        page: pageNum,
        sizeMm,
        xMm: Number((posResult.xPt * MM_PER_PT).toFixed(1)),
        yMm: Number((posResult.yPt * MM_PER_PT).toFixed(1)),
        xPt: Number(posResult.xPt.toFixed(2)),
        yPt: Number(posResult.yPt.toFixed(2)),
        resolvedBy: posResult.resolvedBy,
      });
    }

    const outBytes = await pdfDoc.save();
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, outBytes);

    let driveCopyPath = null;
    if (args['save-drive']) {
      const driveDir =
        typeof args['save-drive'] === 'string'
          ? args['save-drive']
          : 'C:\\Users\\user\\マイドライブ\\YDK_System_Root\\00_Hub\\Reports';
      fs.mkdirSync(driveDir, { recursive: true });
      driveCopyPath = path.join(driveDir, path.basename(resolvedOut));
      fs.copyFileSync(resolvedOut, driveCopyPath);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          inputPdf: resolvedIn,
          outputPdf: resolvedOut,
          driveCopyPath,
          totalPages: pages.length,
          appliedStamps,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`
YDK スマート電子印鑑スタジオ - AI Agent Headless CLI (ydk_seal_cli.mjs)
========================================================================
使い方:
  1. プリセット一覧の確認:
     node ydk_seal_cli.mjs presets [--json]

  2. 透過PNG印影画像（600DPI）の生成:
     node ydk_seal_cli.mjs image --preset preset-ydk-official-scan --out seal.png
     node ydk_seal_cli.mjs image --type mitome --text "阿部" --size-mm 10.5 --out abe.png

  3. PDF内のテキストと座標（アンカー候補）の検査:
     node ydk_seal_cli.mjs inspect --pdf invoice.pdf

  4. PDFへの自動押印（アンカー検索 / 領域名 / mm座標 / 複数一括指定）:
     node ydk_seal_cli.mjs stamp --pdf input.pdf --out output.pdf --preset preset-ydk-official-scan --anchor "印"
     node ydk_seal_cli.mjs stamp --pdf input.pdf --out output.pdf --preset preset-ydk-kakuin-4line --x-mm 155 --y-mm 48 --save-drive

  5. サンプル請求書PDFの生成＋3種同時自動押印テスト:
     node ydk_seal_cli.mjs sample --out sample_stamped.pdf
`);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});

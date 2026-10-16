/**
 * PDF処理＆Googleドライブ連携ユーティリティ
 * pdf-libを使用してPDFへの高精細電子印鑑合成・サンプル帳票生成・Googleドライブ保存を実行
 */

import { PDFDocument as PDFLib, degrees, rgb, StandardFonts } from 'pdf-lib';
import { PDFStamp, DriveFileInfo } from '../types/stamp';

/**
 * FileオブジェクトからPDFDocumentと元バイナリを読み込む
 */
export const loadPDFDocument = async (file: File): Promise<{ pdfDoc: PDFLib; rawBytes: Uint8Array }> => {
  const arrayBuffer = await file.arrayBuffer();
  const rawBytes = new Uint8Array(arrayBuffer);
  const pdfDoc = await PDFLib.load(rawBytes, { ignoreEncryption: true });
  return { pdfDoc, rawBytes };
};

/**
 * Base64文字列（Googleドライブから取得したPDF等）から読み込む
 */
export const loadPDFFromBase64 = async (
  base64Data: string
): Promise<{ pdfDoc: PDFLib; rawBytes: Uint8Array }> => {
  const clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const binStr = atob(clean);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  const pdfDoc = await PDFLib.load(bytes, { ignoreEncryption: true });
  return { pdfDoc, rawBytes: bytes };
};

/**
 * すぐ試せるA4テスト用書類（御見積書・請負契約書サンプルPDF）を動的生成
 */
export const createSampleDocumentPDF = async (): Promise<{
  pdfDoc: PDFLib;
  rawBytes: Uint8Array;
  fileName: string;
}> => {
  const doc = await PDFLib.create();
  const page = doc.addPage([595.28, 841.89]); // A4 (210mm x 297mm)
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // 外枠
  page.drawRectangle({
    x: 40,
    y: 40,
    width: 515.28,
    height: 761.89,
    borderColor: rgb(0.75, 0.78, 0.82),
    borderWidth: 1,
  });

  // ヘッダー帯
  page.drawRectangle({
    x: 40,
    y: 745,
    width: 515.28,
    height: 56.89,
    color: rgb(0.11, 0.23, 0.54),
  });

  page.drawText('YDK RENOVATION CO., LTD. - OFFICIAL DOCUMENT', {
    x: 60,
    y: 768,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  // 押印欄ボックス (右上の社印・代表者印・担当印枠)
  page.drawText('OFFICIAL SEAL / STAMP AREA', {
    x: 355,
    y: 695,
    size: 9,
    font: fontBold,
    color: rgb(0.3, 0.3, 0.35),
  });

  // 角印枠 (右) + 承認・検印・担当枠 (3連)
  const boxY = 610;
  const boxSize = 68;
  for (let i = 0; i < 3; i++) {
    const bx = 340 + i * 68;
    page.drawRectangle({
      x: bx,
      y: boxY,
      width: boxSize,
      height: boxSize,
      borderColor: rgb(0.4, 0.4, 0.45),
      borderWidth: 1,
    });
    page.drawLine({
      start: { x: bx, y: boxY + boxSize - 16 },
      end: { x: bx + boxSize, y: boxY + boxSize - 16 },
      color: rgb(0.4, 0.4, 0.45),
      thickness: 0.8,
    });
    const labels = ['PRESIDENT', 'MANAGER', 'STAFF'];
    page.drawText(labels[i], {
      x: bx + 10,
      y: boxY + boxSize - 12,
      size: 8,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.35),
    });
  }

  // 会社情報＆角印エリア
  page.drawRectangle({
    x: 60,
    y: 610,
    width: 260,
    height: 75,
    borderColor: rgb(0.75, 0.78, 0.82),
    borderWidth: 1,
  });
  page.drawText('YDK Renovation Co., Ltd.', {
    x: 72,
    y: 665,
    size: 12,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.15),
  });
  page.drawText('Invoice Reg No: T6040001119458', {
    x: 72,
    y: 645,
    size: 9.5,
    font,
    color: rgb(0.25, 0.25, 0.3),
  });
  page.drawText('9-11-1-808 Miyamoto,Funabashi,Chiba', {
    x: 72,
    y: 627,
    size: 9,
    font,
    color: rgb(0.25, 0.25, 0.3),
  });

  // 明細テーブル枠
  for (let row = 0; row < 8; row++) {
    const ry = 520 - row * 36;
    page.drawRectangle({
      x: 60,
      y: ry,
      width: 475,
      height: 36,
      borderColor: rgb(0.82, 0.84, 0.88),
      borderWidth: 0.7,
      color: row === 0 ? rgb(0.94, 0.96, 0.99) : rgb(1, 1, 1),
    });
  }

  const rawBytes = await doc.save();
  const loadedDoc = await PDFLib.load(rawBytes);
  return {
    pdfDoc: loadedDoc,
    rawBytes,
    fileName: 'YDK_押印テスト用サンプル帳票_A4.pdf',
  };
};

/**
 * PDFのページ数を取得
 */
export const getPDFPageCount = (pdfDoc: PDFLib): number => {
  return pdfDoc.getPages().length;
};

/**
 * 元PDFバイナリにスタンプを合成した新しいPDFバイナリを生成（元PDFを破壊しない）
 */
export const buildStampedPDFBytes = async (
  rawPdfBytes: Uint8Array,
  stamps: PDFStamp[],
  stampCanvasGenerator: (stamp: PDFStamp) => Promise<HTMLCanvasElement>
): Promise<Uint8Array> => {
  const clonedDoc = await PDFLib.load(rawPdfBytes, { ignoreEncryption: true });
  const pages = clonedDoc.getPages();

  for (const stamp of stamps) {
    const pageIndex = stamp.pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const { height: pageHeight } = page.getSize();

    // 高解像度キャンバスからスタンプPNGを生成
    const canvas = await stampCanvasGenerator(stamp);
    const imageData = canvas.toDataURL('image/png');
    const pngImage = await clonedDoc.embedPng(imageData);

    const { x, y, width, height, rotation = 0, opacity = 1 } = stamp.position;

    // PDFの座標系は左下原点なのでY座標を反転
    const pdfX = x;
    const pdfY = pageHeight - y - height;

    page.drawImage(pngImage, {
      x: pdfX,
      y: pdfY,
      width,
      height,
      opacity,
      rotate: degrees(-rotation),
    });
  }

  return await clonedDoc.save();
};

/**
 * 押印済みPDFをブラウザからダウンロード
 */
export const downloadPDFBytes = (pdfBytes: Uint8Array, filename: string = 'stamped.pdf') => {
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(link);
};

/**
 * Uint8Array を Base64 文字列に変換
 */
export const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
};

/**
 * Google Apps Script (GAS) 環境かどうかの判定
 */
export const isGasEnvironment = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).google !== 'undefined' &&
    typeof (window as any).google.script !== 'undefined' &&
    typeof (window as any).google.script.run !== 'undefined'
  );
};

/**
 * Googleドライブ内のPDFファイル一覧を取得（GAS環境）
 */
export const listGoogleDrivePDFs = (query: string = ''): Promise<DriveFileInfo[]> => {
  return new Promise((resolve, reject) => {
    if (!isGasEnvironment()) {
      resolve([]);
      return;
    }
    (window as any).google.script.run
      .withSuccessHandler((res: DriveFileInfo[]) => resolve(res || []))
      .withFailureHandler((err: any) => reject(err))
      .listDrivePdfFiles(query);
  });
};

/**
 * Googleドライブから指定FileIDのPDFをBase64として読み込む（GAS環境）
 */
export const fetchGoogleDrivePDFBase64 = (
  fileId: string
): Promise<{ fileName: string; base64: string }> => {
  return new Promise((resolve, reject) => {
    if (!isGasEnvironment()) {
      reject(new Error('Google Apps Script環境ではありません'));
      return;
    }
    (window as any).google.script.run
      .withSuccessHandler((res: { fileName: string; base64: string }) => resolve(res))
      .withFailureHandler((err: any) => reject(err))
      .getDriveFileBase64(fileId);
  });
};

/**
 * 押印済みPDFまたは透過PNG印影をGoogleドライブに直接保存（GAS環境 ＆ File System Access APIフォールバック）
 */
export const saveFileToGoogleDrive = async (
  base64OrBytes: string | Uint8Array,
  fileName: string,
  mimeType: string = 'application/pdf'
): Promise<{ success: boolean; url?: string; fileId?: string; message: string }> => {
  const base64Data =
    typeof base64OrBytes === 'string'
      ? base64OrBytes.includes(',')
        ? base64OrBytes.split(',')[1]
        : base64OrBytes
      : uint8ArrayToBase64(base64OrBytes);

  // 1. GAS Web App 上で動作している場合: DriveApp でマイドライブへ直接保存
  if (isGasEnvironment()) {
    return new Promise((resolve, reject) => {
      (window as any).google.script.run
        .withSuccessHandler((res: any) => resolve(res))
        .withFailureHandler((err: any) => reject(err))
        .saveFileToDrive(base64Data, fileName, mimeType);
    });
  }

  // 2. ローカルブラウザの場合: File System Access API (showSaveFilePicker) で G:\マイドライブ 等へ直接保存可能
  if (typeof (window as any).showSaveFilePicker === 'function') {
    try {
      const ext = mimeType.includes('pdf') ? '.pdf' : '.png';
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: mimeType.includes('pdf') ? 'PDF Document' : 'PNG Image',
            accept: { [mimeType]: [ext] },
          },
        ],
      });
      const writable = await handle.createWritable();
      const binStr = atob(base64Data);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      await writable.write(bytes);
      await writable.close();
      return {
        success: true,
        message: `保存完了: ${fileName}`,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { success: false, message: '保存がキャンセルされました' };
      }
    }
  }

  // 3. フォールバック: ブラウザダウンロード
  const binStr = atob(base64Data);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
  return {
    success: true,
    message: `ダウンロード保存しました: ${fileName}`,
  };
};
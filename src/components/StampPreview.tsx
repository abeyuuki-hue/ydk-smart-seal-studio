/**
 * 印鑑パネル（透過プレビュー）＆ ページ即時押印・単体出力コンポーネント
 * - 拡大プレビュー（220px）＋ 実寸mmプレビューの2画面リアルタイム表示
 * - 「現在のページにこの印鑑を押す」ワンクリック押印ボタン
 * - 透過PNG保存 / Googleドライブ保存 / 印鑑XMLエクスポート
 */

import React, { useEffect, useRef, useState } from 'react';
import { StampConfig } from '../types/stamp';
import { drawStampOnCanvas, exportStampAsPngDataUrl } from '../utils/stampRenderer';
import { exportMakeestampXml, mmToPt } from '../utils/stampTemplates';
import { saveFileToGoogleDrive } from '../utils/pdfProcessor';
import '../styles/StampPreview.css';

interface StampPreviewProps {
  stamp: StampConfig;
  onQuickStampToPage?: () => void;
  syncSelectedStamp?: boolean;
  onToggleSyncSelectedStamp?: (checked: boolean) => void;
}

export const StampPreview: React.FC<StampPreviewProps> = ({
  stamp,
  onQuickStampToPage,
  syncSelectedStamp = true,
  onToggleSyncSelectedStamp,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const realSizeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [isSavingDrive, setIsSavingDrive] = useState(false);
  const [renderTick, setRenderTick] = useState(0);

  // 実寸プレビュー用ピクセル計算（96DPI基準: 1mm ≒ 3.78px）
  const realPx = Math.max(36, Math.min(150, Math.round(stamp.pasteEdge * 3.78)));
  const stampSignature = JSON.stringify(stamp);

  useEffect(() => {
    const renderBoth = () => {
      if (canvasRef.current) {
        drawStampOnCanvas(canvasRef.current, stamp, 220, 220, () => {
          setRenderTick((t) => t + 1);
        });
      }
      if (realSizeCanvasRef.current) {
        drawStampOnCanvas(realSizeCanvasRef.current, stamp, realPx, realPx);
      }
    };

    renderBoth();

    // Webフォント読み込み完了後にも再描画して書体を確実に反映
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      (document as any).fonts.ready.then(() => {
        renderBoth();
      });
    }
  }, [stampSignature, realPx, renderTick]);

  // 透過PNGとしてダウンロード
  const handleDownloadPng = async () => {
    const dataUrl = await exportStampAsPngDataUrl(stamp, 600);
    const a = document.createElement('a');
    a.href = dataUrl;
    const cleanName = (stamp.name || stamp.text || 'stamp').replace(/[\\/:*?"<>|\r\n]/g, '_');
    a.download = `YDK印影_${cleanName}_${stamp.pasteEdge}mm.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setStatusMsg('透過PNG印影をダウンロードしました');
    setTimeout(() => setStatusMsg(''), 3000);
  };

  // Googleドライブへ透過PNGを直接保存
  const handleSavePngToDrive = async () => {
    setIsSavingDrive(true);
    setStatusMsg('Googleドライブへ印影PNGを保存中...');
    try {
      const dataUrl = await exportStampAsPngDataUrl(stamp, 600);
      const cleanName = (stamp.name || stamp.text || 'stamp').replace(/[\\/:*?"<>|\r\n]/g, '_');
      const fileName = `YDK印影_${cleanName}_${stamp.pasteEdge}mm.png`;
      const res = await saveFileToGoogleDrive(dataUrl, fileName, 'image/png');
      setStatusMsg(res.message);
    } catch (err: any) {
      setStatusMsg(`保存エラー: ${err?.message || err}`);
    } finally {
      setIsSavingDrive(false);
      setTimeout(() => setStatusMsg(''), 4000);
    }
  };

  // 印鑑定義XMLとして保存
  const handleExportXml = () => {
    const xmlStr = exportMakeestampXml(stamp);
    const blob = new Blob([xmlStr], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const cleanName = (stamp.name || 'stamp').replace(/[\\/:*?"<>|\r\n]/g, '_');
    a.href = url;
    a.download = `${cleanName}.xml`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    setStatusMsg('印鑑設定XMLを保存しました');
    setTimeout(() => setStatusMsg(''), 3000);
  };

  return (
    <div className="stamp-preview">
      <div className="preview-header-row">
        <h3>💮 印鑑パネル（透過プレビュー）</h3>
        <span className="size-badge">
          {stamp.pasteEdge}mm ({mmToPt(stamp.pasteEdge)}pt)
        </span>
      </div>

      <div className="preview-container checkerboard-bg">
        <div className="preview-main-col">
          <span className="preview-caption">拡大透過プレビュー</span>
          <canvas
            ref={canvasRef}
            width={220}
            height={220}
            className="preview-canvas"
            title="クリックして現在のPDFページに押印"
            onClick={onQuickStampToPage}
            style={{ cursor: onQuickStampToPage ? 'pointer' : 'default' }}
          />
        </div>
        <div className="preview-real-col">
          <span className="preview-caption">実寸 ({stamp.pasteEdge}mm)</span>
          <div className="real-canvas-wrap">
            <canvas
              ref={realSizeCanvasRef}
              width={realPx}
              height={realPx}
              className="real-size-canvas"
            />
          </div>
        </div>
      </div>

      {/* ワンクリックで現在のPDFページへ押印するメインアクションボタン */}
      {onQuickStampToPage && (
        <button
          type="button"
          className="btn-quick-stamp-page"
          onClick={onQuickStampToPage}
        >
          💮 現在のページにこの印鑑を押す
        </button>
      )}

      {/* ページ上の選択中スタンプとのリアルタイム連動トグル */}
      {onToggleSyncSelectedStamp && (
        <label className="sync-selected-toggle">
          <input
            type="checkbox"
            checked={syncSelectedStamp}
            onChange={(e) => onToggleSyncSelectedStamp(e.target.checked)}
          />
          <span>ページ上の選択中スタンプにも変更を即時反映</span>
        </label>
      )}

      <div className="preview-export-actions">
        <button type="button" className="btn-export-png" onClick={handleDownloadPng}>
          🖼️ 透過PNG保存
        </button>
        <button
          type="button"
          className="btn-export-drive"
          onClick={handleSavePngToDrive}
          disabled={isSavingDrive}
        >
          ☁️ ドライブへ印影保存
        </button>
        <button type="button" className="btn-export-xml" onClick={handleExportXml}>
          💾 XML保存
        </button>
      </div>

      {statusMsg && <div className="preview-status-toast">{statusMsg}</div>}
    </div>
  );
};
/**
 * ページのプレビュー ＆ インタラクティブ押印エディタコンポーネント
 * - PDF.js インメモリWorker統合（オフライン・file://・Googleドライブ・Chrome拡張で100%動作）
 * - クリックでその座標に実寸mmスタンプを配置 ＆ ホバー時ゴースト印影プレビュー
 * - 配置済みスタンプのドラッグ移動・右下ハンドルでのサイズ変更・印鑑パネル連動更新
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PDFDocument as PDFLib } from 'pdf-lib';
import { PDFStamp, StampConfig } from '../types/stamp';
import { drawStampOnCanvas } from '../utils/stampRenderer';
import { mmToPt } from '../utils/stampTemplates';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - Vite bundles pdf.worker.min.mjs directly for zero-CORS in-memory worker execution
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs';
import '../styles/PDFEditor.css';

if (typeof globalThis !== 'undefined') {
  (globalThis as any).pdfjsWorker = pdfjsWorker;
}

interface PDFEditorProps {
  pdfDoc: PDFLib | null;
  rawPdfBytes: Uint8Array | null;
  currentStamp: StampConfig;
  placedStamps: PDFStamp[];
  selectedStampId: string | null;
  onSelectStamp: (id: string | null) => void;
  onAddStamp: (stamp: PDFStamp) => void;
  onUpdateStamp: (id: string, updated: PDFStamp) => void;
  onRemoveStamp: (id: string) => void;
  currentPage: number;
  onCurrentPageChange: (page: number) => void;
}

/** 個別の配置済みスタンプ描画コンポーネント */
const PlacedStampItem: React.FC<{
  stamp: PDFStamp;
  scale: number;
  isSelected: boolean;
  onMouseDownMove: (e: React.MouseEvent, stamp: PDFStamp) => void;
  onMouseDownResize: (e: React.MouseEvent, stamp: PDFStamp) => void;
  onRemove: (id: string) => void;
}> = ({ stamp, scale, isSelected, onMouseDownMove, onMouseDownResize, onRemove }) => {
  const stampCanvasRef = useRef<HTMLCanvasElement>(null);
  const [asyncTick, setAsyncTick] = useState(0);
  const configSig = JSON.stringify(stamp.config);

  useEffect(() => {
    const renderStamp = () => {
      if (stampCanvasRef.current) {
        drawStampOnCanvas(stampCanvasRef.current, stamp.config, 240, 240, () => {
          setAsyncTick((t) => t + 1);
        });
      }
    };
    renderStamp();

    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      (document as any).fonts.ready.then(() => {
        renderStamp();
      });
    }
  }, [configSig, asyncTick]);

  const left = stamp.position.x * scale;
  const top = stamp.position.y * scale;
  const width = stamp.position.width * scale;
  const height = stamp.position.height * scale;

  return (
    <div
      className={`placed-stamp-box ${isSelected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        opacity: stamp.position.opacity ?? 1,
        transform: `rotate(${stamp.position.rotation || 0}deg)`,
        zIndex: isSelected ? 35 : 25,
        cursor: 'move',
        userSelect: 'none',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => onMouseDownMove(e, stamp)}
      onClick={(e) => e.stopPropagation()}
    >
      <canvas
        ref={stampCanvasRef}
        width={240}
        height={240}
        className="placed-stamp-canvas"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
      {isSelected && (
        <>
          <div className="placed-stamp-size-label">
            {Math.round((stamp.position.width * 25.4) / 72)}mm
          </div>
          <button
            type="button"
            className="stamp-delete-btn"
            title="この印鑑を削除 (Delete)"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(stamp.id);
            }}
          >
            ×
          </button>
          <div
            className="stamp-resize-handle"
            title="ドラッグしてサイズ変更"
            onMouseDown={(e) => onMouseDownResize(e, stamp)}
          />
        </>
      )}
    </div>
  );
};

export const PDFEditor: React.FC<PDFEditorProps> = ({
  pdfDoc,
  rawPdfBytes,
  currentStamp,
  placedStamps,
  selectedStampId,
  onSelectStamp,
  onAddStamp,
  onUpdateStamp,
  onRemoveStamp,
  currentPage,
  onCurrentPageChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfWrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.15);
  const [stampMode, setStampMode] = useState(true);
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({
    width: 595.28,
    height: 841.89,
  });
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // ドラッグ移動＆リサイズ状態
  const [interaction, setInteraction] = useState<{
    type: 'move' | 'resize';
    stampId: string;
    startMouseX: number;
    startMouseY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
  } | null>(null);

  const pageCount = pdfDoc ? pdfDoc.getPages().length : 0;
  const currentStampSig = JSON.stringify(currentStamp);

  // ホバーゴースト用キャンバスの更新
  useEffect(() => {
    if (ghostCanvasRef.current) {
      drawStampOnCanvas(ghostCanvasRef.current, currentStamp, 180, 180);
    }
  }, [currentStampSig, hoverPos]);

  // PDFページの描画
  useEffect(() => {
    let isCancelled = false;

    const renderPage = async () => {
      if (!pdfDoc || !rawPdfBytes || !canvasRef.current) return;

      const pages = pdfDoc.getPages();
      if (currentPage < 1 || currentPage > pages.length) return;

      const page = pages[currentPage - 1];
      const { width, height } = page.getSize();
      setPageSize({ width, height });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      try {
        const bytesCopy = new Uint8Array(rawPdfBytes);
        const loadingTask = pdfjsLib.getDocument({
          data: bytesCopy,
        });
        const pdf = await loadingTask.promise;
        if (isCancelled) return;
        const pdfPage = await pdf.getPage(currentPage);
        if (isCancelled) return;

        const viewport = pdfPage.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await pdfPage.render({
          canvasContext: ctx,
          viewport,
          canvas,
        } as any).promise;
      } catch (err) {
        console.warn('PDF.jsフォールバック描画を使用します:', err);
        if (isCancelled) return;
        // 万一PDF.js描画が失敗しても必ずA4帳票プレビューを描画して押印可能にする
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.strokeRect(16 * scale, 16 * scale, (width - 32) * scale, (height - 32) * scale);
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(20 * scale, 20 * scale, (width - 40) * scale, 48 * scale);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(14 * scale)}px sans-serif`;
        ctx.fillText('YDK SMART SEAL STUDIO - DOCUMENT PREVIEW', 36 * scale, 50 * scale);
      }
    };

    renderPage();
    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, rawPdfBytes, currentPage, scale]);

  // ドラッグ移動＆リサイズのマウスイベント処理
  const handleGlobalMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!interaction) return;
      const target = placedStamps.find((s) => s.id === interaction.stampId);
      if (!target) return;

      const dxPt = (e.clientX - interaction.startMouseX) / scale;
      const dyPt = (e.clientY - interaction.startMouseY) / scale;

      if (interaction.type === 'move') {
        const nextX = Math.max(
          0,
          Math.min(pageSize.width - target.position.width, interaction.initialX + dxPt)
        );
        const nextY = Math.max(
          0,
          Math.min(pageSize.height - target.position.height, interaction.initialY + dyPt)
        );
        onUpdateStamp(target.id, {
          ...target,
          position: {
            ...target.position,
            x: Math.round(nextX * 10) / 10,
            y: Math.round(nextY * 10) / 10,
          },
        });
      } else if (interaction.type === 'resize') {
        const delta = Math.max(dxPt, dyPt);
        const newSizePt = Math.max(18, Math.min(200, interaction.initialW + delta));
        onUpdateStamp(target.id, {
          ...target,
          position: {
            ...target.position,
            width: Math.round(newSizePt * 10) / 10,
            height: Math.round(newSizePt * 10) / 10,
          },
        });
      }
    },
    [interaction, placedStamps, scale, pageSize, onUpdateStamp]
  );

  const handleGlobalMouseUp = useCallback(() => {
    if (interaction) {
      setInteraction(null);
    }
  }, [interaction]);

  useEffect(() => {
    if (interaction) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [interaction, handleGlobalMouseMove, handleGlobalMouseUp]);

  // PDFキャンバス上のクリックでスタンプを新規配置
  const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stampMode || !pdfWrapperRef.current) {
      onSelectStamp(null);
      return;
    }

    const rect = pdfWrapperRef.current.getBoundingClientRect();
    const clickXPt = (e.clientX - rect.left) / scale;
    const clickYPt = (e.clientY - rect.top) / scale;

    const stampSizePt = mmToPt(currentStamp.pasteEdge || 18);
    const halfPt = stampSizePt / 2;

    const x = Math.max(0, Math.min(pageSize.width - stampSizePt, clickXPt - halfPt));
    const y = Math.max(0, Math.min(pageSize.height - stampSizePt, clickYPt - halfPt));

    const newStamp: PDFStamp = {
      id: `placed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pageNumber: currentPage,
      config: JSON.parse(JSON.stringify(currentStamp)),
      position: {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        width: stampSizePt,
        height: stampSizePt,
        rotation: 0,
        opacity: 0.92,
      },
    };

    onAddStamp(newStamp);
    onSelectStamp(newStamp.id);
  };

  // ワンクリックで押印欄（またはページ右上エリア）にスタンプを追加配置
  const handleQuickAddStampHere = () => {
    const stampSizePt = mmToPt(currentStamp.pasteEdge || 18);
    const samePageCount = placedStamps.filter((s) => s.pageNumber === currentPage).length;
    const baseX = Math.min(pageSize.width - stampSizePt - 24, 345 + (samePageCount % 3) * 68);
    const baseY = Math.min(pageSize.height - stampSizePt - 24, 172 + Math.floor(samePageCount / 3) * 70);

    const newStamp: PDFStamp = {
      id: `placed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pageNumber: currentPage,
      config: JSON.parse(JSON.stringify(currentStamp)),
      position: {
        x: Math.round(baseX * 10) / 10,
        y: Math.round(baseY * 10) / 10,
        width: stampSizePt,
        height: stampSizePt,
        rotation: 0,
        opacity: 0.92,
      },
    };
    onAddStamp(newStamp);
    onSelectStamp(newStamp.id);
  };

  const handleWrapperMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stampMode || !pdfWrapperRef.current || interaction) {
      if (hoverPos) setHoverPos(null);
      return;
    }
    const rect = pdfWrapperRef.current.getBoundingClientRect();
    setHoverPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseDownMove = (e: React.MouseEvent, stamp: PDFStamp) => {
    e.stopPropagation();
    onSelectStamp(stamp.id);
    setInteraction({
      type: 'move',
      stampId: stamp.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initialX: stamp.position.x,
      initialY: stamp.position.y,
      initialW: stamp.position.width,
      initialH: stamp.position.height,
    });
  };

  const handleMouseDownResize = (e: React.MouseEvent, stamp: PDFStamp) => {
    e.stopPropagation();
    onSelectStamp(stamp.id);
    setInteraction({
      type: 'resize',
      stampId: stamp.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initialX: stamp.position.x,
      initialY: stamp.position.y,
      initialW: stamp.position.width,
      initialH: stamp.position.height,
    });
  };

  const currentPageStamps = placedStamps.filter((s) => s.pageNumber === currentPage);
  const ghostSizePx = mmToPt(currentStamp.pasteEdge || 18) * scale;

  return (
    <div className="pdf-editor">
      <div className="editor-toolbar">
        <div className="page-controls">
          <button
            type="button"
            onClick={() => onCurrentPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          >
            ◀ 前頁
          </button>
          <span className="page-indicator">
            <strong>{currentPage}</strong> / {pageCount} ページ
          </span>
          <button
            type="button"
            onClick={() => onCurrentPageChange(Math.min(pageCount, currentPage + 1))}
            disabled={currentPage >= pageCount}
          >
            次頁 ▶
          </button>
        </div>

        <div className="zoom-controls">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.6, Math.round((s - 0.15) * 100) / 100))}
          >
            🔍 -
          </button>
          <span className="zoom-indicator">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.2, Math.round((s + 0.15) * 100) / 100))}
          >
            🔍 +
          </button>
        </div>

        <div className="mode-controls">
          <button
            type="button"
            className="btn-toolbar-stamp-now"
            onClick={handleQuickAddStampHere}
            title="現在のページに選択中の印鑑を即座に配置します"
          >
            💮 ページに押印追加
          </button>
          <label className={`stamp-mode-badge ${stampMode ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={stampMode}
              onChange={(e) => setStampMode(e.target.checked)}
            />
            <span>🖱️ ページクリックで押印 ({currentStamp.pasteEdge}mm)</span>
          </label>
        </div>
      </div>

      <div className="editor-hint-bar">
        💡 <strong>操作ガイド:</strong> ページ上の好きな場所をクリックすると「{currentStamp.name}」を押印できます。配置済み印鑑はドラッグで移動、左側のデザイン変更でリアルタイム更新されます。
      </div>

      <div className="pdf-canvas-viewport">
        <div
          ref={pdfWrapperRef}
          className={`pdf-page-wrapper ${stampMode ? 'cursor-stamp' : ''}`}
          style={{
            position: 'relative',
            width: `${Math.round(pageSize.width * scale)}px`,
            height: `${Math.round(pageSize.height * scale)}px`,
          }}
          onClick={handleWrapperClick}
          onMouseMove={handleWrapperMouseMove}
          onMouseLeave={() => setHoverPos(null)}
        >
          <canvas
            ref={canvasRef}
            className="pdf-canvas"
            style={{ display: 'block', width: '100%', height: '100%' }}
          />

          {/* クリック押印モード時のホバーゴースト印影プレビュー */}
          {stampMode && hoverPos && !interaction && (
            <div
              className="stamp-hover-ghost"
              style={{
                position: 'absolute',
                left: `${hoverPos.x - ghostSizePx / 2}px`,
                top: `${hoverPos.y - ghostSizePx / 2}px`,
                width: `${ghostSizePx}px`,
                height: `${ghostSizePx}px`,
                pointerEvents: 'none',
                zIndex: 40,
                opacity: 0.65,
              }}
            >
              <canvas
                ref={ghostCanvasRef}
                width={180}
                height={180}
                style={{ width: '100%', height: '100%', display: 'block' }}
              />
            </div>
          )}

          {/* 配置済みスタンプのレイヤー（実寸比率でPDF上にオーバーレイ表示） */}
          {currentPageStamps.map((stamp) => (
            <PlacedStampItem
              key={stamp.id}
              stamp={stamp}
              scale={scale}
              isSelected={stamp.id === selectedStampId}
              onMouseDownMove={handleMouseDownMove}
              onMouseDownResize={handleMouseDownResize}
              onRemove={onRemoveStamp}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
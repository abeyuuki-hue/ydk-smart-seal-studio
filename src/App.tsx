/**
 * YDK スマート電子印鑑スタジオ (YDK Smart Seal Studio v1.0)
 * - 印鑑パネル（透過プレビュー）＆ ページのプレビュー リアルタイム完全同期
 * - 代表者印・会社角印・認印・日付データネーム印・実物透過印の完全再現
 * - Googleドライブ直接入出力 ＆ Chrome拡張サイドパネル完全対応
 */

import { useState, useEffect, useCallback } from 'react';
import { PDFDocument as PDFLib } from 'pdf-lib';
import { StampConfig, PDFStamp } from './types/stamp';
import { presetStamps, mmToPt } from './utils/stampTemplates';
import { generateStampCanvas } from './utils/stampRenderer';
import {
  loadPDFDocument,
  loadPDFFromBase64,
  createSampleDocumentPDF,
  buildStampedPDFBytes,
  downloadPDFBytes,
  saveFileToGoogleDrive,
  uint8ArrayToBase64,
} from './utils/pdfProcessor';
import { PDFUploader } from './components/PDFUploader';
import { StampDesigner } from './components/StampDesigner';
import { StampPreview } from './components/StampPreview';
import { PDFEditor } from './components/PDFEditor';
import './App.css';

function App() {
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [pdfDoc, setPdfDoc] = useState<PDFLib | null>(null);
  const [rawPdfBytes, setRawPdfBytes] = useState<Uint8Array | null>(null);
  const [currentStamp, setCurrentStamp] = useState<StampConfig>(presetStamps[0]);
  const [placedStamps, setPlacedStamps] = useState<PDFStamp[]>([]);
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [syncSelectedStamp, setSyncSelectedStamp] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string>('');

  const showToast = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(''), 4500);
  };

  // 起動時にA4サンプル帳票と初期スタンプを自動ロードし、ページプレビューを即座に表示
  useEffect(() => {
    let mounted = true;
    const initSample = async () => {
      try {
        const { pdfDoc: doc, rawBytes, fileName } = await createSampleDocumentPDF();
        if (!mounted) return;
        const initConfig: StampConfig = JSON.parse(JSON.stringify(presetStamps[0]));
        const sizePt = mmToPt(initConfig.pasteEdge || 18);
        const initPlaced: PDFStamp = {
          id: 'placed-initial-sample',
          pageNumber: 1,
          config: initConfig,
          position: {
            x: 348,
            y: 172,
            width: sizePt,
            height: sizePt,
            rotation: 0,
            opacity: 0.92,
          },
        };
        setPdfDoc(doc);
        setRawPdfBytes(rawBytes);
        setPdfFileName(fileName);
        setPlacedStamps([initPlaced]);
        setSelectedStampId(initPlaced.id);
        setCurrentPage(1);
      } catch (err) {
        console.error('初期サンプル帳票生成エラー:', err);
      }
    };
    initSample();
    return () => {
      mounted = false;
    };
  }, []);

  // 印鑑デザインの変更ハンドラ（印鑑パネル＋ページ上の選択中スタンプを同時リアルタイム更新）
  const handleStampChange = useCallback(
    (updatedConfig: StampConfig) => {
      setCurrentStamp(updatedConfig);
      if (syncSelectedStamp && selectedStampId) {
        const newSizePt = mmToPt(updatedConfig.pasteEdge || 18);
        setPlacedStamps((prev) =>
          prev.map((s) =>
            s.id === selectedStampId
              ? {
                  ...s,
                  config: JSON.parse(JSON.stringify(updatedConfig)),
                  position: {
                    ...s.position,
                    width: newSizePt,
                    height: newSizePt,
                  },
                }
              : s
          )
        );
      }
    },
    [syncSelectedStamp, selectedStampId]
  );

  // ワンクリックで現在のPDFページにスタンプを押印
  const handleQuickStampToPage = useCallback(async () => {
    let activeDoc = pdfDoc;
    if (!activeDoc) {
      const { pdfDoc: doc, rawBytes, fileName } = await createSampleDocumentPDF();
      activeDoc = doc;
      setPdfDoc(doc);
      setRawPdfBytes(rawBytes);
      setPdfFileName(fileName);
    }

    const pages = activeDoc.getPages();
    const pageIdx = Math.max(0, Math.min(pages.length - 1, currentPage - 1));
    const { width: pageW, height: pageH } = pages[pageIdx].getSize();

    const stampSizePt = mmToPt(currentStamp.pasteEdge || 18);
    const samePageCount = placedStamps.filter((s) => s.pageNumber === currentPage).length;
    const targetX = Math.min(pageW - stampSizePt - 24, 348 + (samePageCount % 3) * 68);
    const targetY = Math.min(pageH - stampSizePt - 24, 172 + Math.floor(samePageCount / 3) * 70);

    const newStamp: PDFStamp = {
      id: `placed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pageNumber: currentPage,
      config: JSON.parse(JSON.stringify(currentStamp)),
      position: {
        x: Math.round(targetX * 10) / 10,
        y: Math.round(targetY * 10) / 10,
        width: stampSizePt,
        height: stampSizePt,
        rotation: 0,
        opacity: 0.92,
      },
    };

    setPlacedStamps((prev) => [...prev, newStamp]);
    setSelectedStampId(newStamp.id);
    showToast(`💮 ページ ${currentPage} に「${currentStamp.name}」を押印しました`);
  }, [pdfDoc, currentPage, currentStamp, placedStamps]);

  // 1. ローカルPDFファイルの読み込み
  const handlePDFSelect = async (file: File) => {
    setIsProcessing(true);
    try {
      const { pdfDoc: doc, rawBytes } = await loadPDFDocument(file);
      const stampSizePt = mmToPt(currentStamp.pasteEdge || 18);
      const initialStamp: PDFStamp = {
        id: `placed-${Date.now()}`,
        pageNumber: 1,
        config: JSON.parse(JSON.stringify(currentStamp)),
        position: {
          x: 348,
          y: 172,
          width: stampSizePt,
          height: stampSizePt,
          rotation: 0,
          opacity: 0.92,
        },
      };
      setPdfFileName(file.name);
      setPdfDoc(doc);
      setRawPdfBytes(rawBytes);
      setPlacedStamps([initialStamp]);
      setSelectedStampId(initialStamp.id);
      setCurrentPage(1);
      showToast(`📄 「${file.name}」を読み込み、初期印鑑を配置しました`);
    } catch (error) {
      console.error('PDF読み込みエラー:', error);
      alert('PDFファイルの読み込みに失敗しました。');
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Googleドライブ上のPDF読み込み
  const handleDrivePDFSelect = async (fileName: string, base64Data: string) => {
    setIsProcessing(true);
    try {
      const { pdfDoc: doc, rawBytes } = await loadPDFFromBase64(base64Data);
      const stampSizePt = mmToPt(currentStamp.pasteEdge || 18);
      const initialStamp: PDFStamp = {
        id: `placed-${Date.now()}`,
        pageNumber: 1,
        config: JSON.parse(JSON.stringify(currentStamp)),
        position: {
          x: 348,
          y: 172,
          width: stampSizePt,
          height: stampSizePt,
          rotation: 0,
          opacity: 0.92,
        },
      };
      setPdfFileName(fileName);
      setPdfDoc(doc);
      setRawPdfBytes(rawBytes);
      setPlacedStamps([initialStamp]);
      setSelectedStampId(initialStamp.id);
      setCurrentPage(1);
      showToast(`☁️ Googleドライブから「${fileName}」を読み込みました`);
    } catch (error) {
      console.error('Drive PDF読み込みエラー:', error);
      alert('GoogleドライブのPDF読み込みに失敗しました。');
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. A4テスト用サンプル帳票の生成
  const handleCreateSamplePDF = async () => {
    setIsProcessing(true);
    try {
      const { pdfDoc: doc, rawBytes, fileName } = await createSampleDocumentPDF();
      const stampSizePt = mmToPt(currentStamp.pasteEdge || 18);
      const samplePlaced: PDFStamp = {
        id: `placed-${Date.now()}`,
        pageNumber: 1,
        config: JSON.parse(JSON.stringify(currentStamp)),
        position: {
          x: 348,
          y: 172,
          width: stampSizePt,
          height: stampSizePt,
          rotation: 0,
          opacity: 0.92,
        },
      };
      setPdfFileName(fileName);
      setPdfDoc(doc);
      setRawPdfBytes(rawBytes);
      setPlacedStamps([samplePlaced]);
      setSelectedStampId(samplePlaced.id);
      setCurrentPage(1);
      showToast('🧪 A4テスト帳票を生成し、押印欄にスタンプを配置しました');
    } catch (error) {
      console.error('サンプルPDF生成エラー:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // スタンプ操作ハンドラ
  const handleAddStamp = (stamp: PDFStamp) => {
    setPlacedStamps((prev) => [...prev, stamp]);
  };

  const handleUpdateStamp = (id: string, updated: PDFStamp) => {
    setPlacedStamps((prev) => prev.map((s) => (s.id === id ? updated : s)));
  };

  const handleRemoveStamp = (id: string) => {
    setPlacedStamps((prev) => prev.filter((s) => s.id !== id));
    if (selectedStampId === id) {
      setSelectedStampId(null);
    }
  };

  const handleSelectPlacedStamp = (id: string | null) => {
    setSelectedStampId(id);
    if (id) {
      const found = placedStamps.find((s) => s.id === id);
      if (found) {
        setCurrentStamp(JSON.parse(JSON.stringify(found.config)));
      }
    }
  };

  // キーボード Delete / Backspace で選択中スタンプ削除
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedStampId) {
        handleRemoveStamp(selectedStampId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedStampId]);

  // 押印済みPDFをダウンロード保存
  const handleDownloadStampedPDF = async () => {
    if (!rawPdfBytes) return;
    setIsProcessing(true);
    try {
      const pdfBytes = await buildStampedPDFBytes(rawPdfBytes, placedStamps, generateStampCanvas);
      const baseName = pdfFileName.replace(/\.pdf$/i, '') || 'document';
      const outName = `${baseName}_押印済.pdf`;
      downloadPDFBytes(pdfBytes, outName);
      showToast(`📥 押印済みPDF「${outName}」をダウンロードしました`);
    } catch (error) {
      console.error('PDF出力エラー:', error);
      alert('PDF出力に失敗しました。');
    } finally {
      setIsProcessing(false);
    }
  };

  // 押印済みPDFをGoogleドライブへ直接保存
  const handleSaveStampedPDFToDrive = async () => {
    if (!rawPdfBytes) return;
    setIsProcessing(true);
    try {
      const pdfBytes = await buildStampedPDFBytes(rawPdfBytes, placedStamps, generateStampCanvas);
      const baseName = pdfFileName.replace(/\.pdf$/i, '') || 'document';
      const outName = `${baseName}_押印済.pdf`;
      const res = await saveFileToGoogleDrive(pdfBytes, outName, 'application/pdf');
      showToast(`☁️ ${res.message}`);
    } catch (error: any) {
      console.error('Googleドライブ保存エラー:', error);
      alert(`Googleドライブへの保存に失敗しました: ${error?.message || error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // AI Agent (chrome-devtools-mcp / agent-browser / CLI) 向けプログラマティック操作APIを公開
  useEffect(() => {
    (window as any).YDKSealAgentAPI = {
      version: '2.2.0',
      listPresets: () =>
        presetStamps.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          text: p.text,
          pasteEdgeMm: p.pasteEdge,
        })),
      getCurrentStamp: () => JSON.parse(JSON.stringify(currentStamp)),
      selectPreset: (idOrQuery: string) => {
        const q = (idOrQuery || '').toLowerCase();
        const found =
          presetStamps.find((p) => p.id.toLowerCase() === q) ||
          presetStamps.find(
            (p) =>
              (p.name || '').toLowerCase().includes(q) ||
              (p.text || '').toLowerCase().includes(q) ||
              p.id.toLowerCase().includes(q)
          );
        if (!found) return { ok: false, error: `Preset not found: ${idOrQuery}` };
        const cloned = JSON.parse(JSON.stringify(found));
        handleStampChange(cloned);
        return { ok: true, preset: cloned };
      },
      updateStampConfig: (partial: Partial<StampConfig>) => {
        const next: StampConfig = { ...currentStamp, ...partial };
        handleStampChange(next);
        return { ok: true, config: next };
      },
      renderStampPngDataUrl: async (presetIdOrConfig?: string | Partial<StampConfig>) => {
        let cfg: StampConfig = JSON.parse(JSON.stringify(currentStamp));
        if (typeof presetIdOrConfig === 'string') {
          const found = presetStamps.find(
            (p) => p.id === presetIdOrConfig || (p.name || '').includes(presetIdOrConfig)
          );
          if (found) cfg = JSON.parse(JSON.stringify(found));
        } else if (presetIdOrConfig && typeof presetIdOrConfig === 'object') {
          cfg = { ...cfg, ...presetIdOrConfig };
        }
        const sizePt = mmToPt(cfg.pasteEdge || 18);
        const canvas = await generateStampCanvas({
          id: 'agent-render',
          pageNumber: 1,
          config: cfg,
          position: { x: 0, y: 0, width: sizePt, height: sizePt, rotation: 0, opacity: 1 },
        });
        return canvas.toDataURL('image/png');
      },
      loadPdfBase64: async (base64Data: string, fileName: string = 'agent_input.pdf') => {
        await handleDrivePDFSelect(fileName, base64Data);
        return { ok: true, fileName };
      },
      placeStamp: (opts?: {
        presetId?: string;
        config?: Partial<StampConfig>;
        pageNumber?: number;
        x?: number;
        y?: number;
        xMm?: number;
        yMm?: number;
        sizeMm?: number;
        rotation?: number;
        opacity?: number;
      }) => {
        let cfg: StampConfig = JSON.parse(JSON.stringify(currentStamp));
        if (opts?.presetId) {
          const found = presetStamps.find(
            (p) => p.id === opts.presetId || (p.name || '').includes(opts.presetId!)
          );
          if (found) cfg = JSON.parse(JSON.stringify(found));
        }
        if (opts?.config) {
          cfg = { ...cfg, ...opts.config };
        }
        const edgeMm = opts?.sizeMm ?? cfg.pasteEdge ?? 18;
        cfg.pasteEdge = edgeMm;
        const sizePt = mmToPt(edgeMm);
        const xPt = opts?.xMm !== undefined ? mmToPt(opts.xMm) : (opts?.x ?? 348);
        const yPt = opts?.yMm !== undefined ? mmToPt(opts.yMm) : (opts?.y ?? 172);
        const newStamp: PDFStamp = {
          id: `agent-placed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          pageNumber: opts?.pageNumber ?? currentPage,
          config: cfg,
          position: {
            x: Math.round(xPt * 10) / 10,
            y: Math.round(yPt * 10) / 10,
            width: sizePt,
            height: sizePt,
            rotation: opts?.rotation ?? 0,
            opacity: opts?.opacity ?? 0.92,
          },
        };
        setPlacedStamps((prev) => [...prev, newStamp]);
        setSelectedStampId(newStamp.id);
        return { ok: true, stamp: newStamp };
      },
      clearStamps: () => {
        setPlacedStamps([]);
        setSelectedStampId(null);
        return { ok: true };
      },
      getPlacedStamps: () => JSON.parse(JSON.stringify(placedStamps)),
      exportStampedPdfBase64: async () => {
        if (!rawPdfBytes) throw new Error('No PDF loaded');
        const outBytes = await buildStampedPDFBytes(rawPdfBytes, placedStamps, generateStampCanvas);
        const baseName = pdfFileName.replace(/\.pdf$/i, '') || 'document';
        return {
          ok: true,
          fileName: `${baseName}_押印済.pdf`,
          stampCount: placedStamps.length,
          base64: uint8ArrayToBase64(outBytes),
        };
      },
      saveToGoogleDrive: async (customFileName?: string) => {
        if (!rawPdfBytes) throw new Error('No PDF loaded');
        const outBytes = await buildStampedPDFBytes(rawPdfBytes, placedStamps, generateStampCanvas);
        const baseName = pdfFileName.replace(/\.pdf$/i, '') || 'document';
        const outName = customFileName || `${baseName}_押印済.pdf`;
        return await saveFileToGoogleDrive(outBytes, outName, 'application/pdf');
      },
    };
  }, [currentStamp, placedStamps, rawPdfBytes, pdfFileName, currentPage, handleStampChange]);

  const selectedPlaced = placedStamps.find((s) => s.id === selectedStampId) || null;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-seal-icon">印</span>
          <div>
            <h1>YDK スマート電子印鑑スタジオ</h1>
            <p className="subtitle">
              YDK Smart Seal Studio v1.0 — 透過印鑑パネル＆PDFページプレビュー完全同期・Googleドライブ直結
            </p>
          </div>
        </div>
        <div className="header-quick-actions">
          <button
            type="button"
            className="btn-header-stamp"
            onClick={handleQuickStampToPage}
            disabled={isProcessing}
          >
            💮 現在のページに押印
          </button>
          {rawPdfBytes && (
            <>
              <button
                type="button"
                className="btn-header-download"
                onClick={handleDownloadStampedPDF}
                disabled={isProcessing || placedStamps.length === 0}
              >
                📥 押印済みPDFダウンロード ({placedStamps.length}箇所)
              </button>
              <button
                type="button"
                className="btn-header-drive"
                onClick={handleSaveStampedPDFToDrive}
                disabled={isProcessing || placedStamps.length === 0}
              >
                ☁️ Googleドライブへ保存
              </button>
            </>
          )}
        </div>
      </header>

      {bannerMessage && <div className="top-toast-banner">{bannerMessage}</div>}

      <div className="app-container">
        {/* 左カラム: 印鑑デザイナー & YDKプリセット */}
        <aside className="left-sidebar">
          <StampDesigner
            stamp={currentStamp}
            onStampChange={handleStampChange}
            onQuickStampToPage={handleQuickStampToPage}
          />
        </aside>

        {/* 中央カラム: PDFファイル選択バー ＆ ページのプレビュー（押印キャンバス） */}
        <main className="main-content">
          <PDFUploader
            onPDFSelect={handlePDFSelect}
            onDrivePDFSelect={handleDrivePDFSelect}
            onCreateSamplePDF={handleCreateSamplePDF}
            fileName={pdfFileName}
          />

          {pdfDoc && rawPdfBytes && (
            <PDFEditor
              pdfDoc={pdfDoc}
              rawPdfBytes={rawPdfBytes}
              currentStamp={currentStamp}
              placedStamps={placedStamps}
              selectedStampId={selectedStampId}
              onSelectStamp={handleSelectPlacedStamp}
              onAddStamp={handleAddStamp}
              onUpdateStamp={handleUpdateStamp}
              onRemoveStamp={handleRemoveStamp}
              currentPage={currentPage}
              onCurrentPageChange={setCurrentPage}
            />
          )}
        </main>

        {/* 右カラム: 印鑑パネル（透過プレビュー） ＆ 配置済み印鑑微調整リスト */}
        <aside className="right-sidebar">
          <StampPreview
            stamp={currentStamp}
            onQuickStampToPage={handleQuickStampToPage}
            syncSelectedStamp={syncSelectedStamp}
            onToggleSyncSelectedStamp={setSyncSelectedStamp}
          />

          <div className="placed-stamps-panel">
            <div className="panel-title-row">
              <h3>📌 ページ配置済み印鑑 ({placedStamps.length})</h3>
              {placedStamps.length > 0 && (
                <button
                  type="button"
                  className="btn-clear-all"
                  onClick={() => {
                    setPlacedStamps([]);
                    setSelectedStampId(null);
                  }}
                >
                  全消去
                </button>
              )}
            </div>

            {selectedPlaced && (
              <div className="selected-stamp-adjuster">
                <div className="adjuster-title">🔧 選択中の印鑑を微調整</div>
                <div className="adjuster-row">
                  <label>サイズ(mm):</label>
                  <input
                    type="number"
                    min="6"
                    max="60"
                    step="0.5"
                    value={Math.round(((selectedPlaced.position.width * 25.4) / 72) * 10) / 10}
                    onChange={(e) => {
                      const mm = parseFloat(e.target.value) || 18;
                      const pt = mmToPt(mm);
                      handleUpdateStamp(selectedPlaced.id, {
                        ...selectedPlaced,
                        position: {
                          ...selectedPlaced.position,
                          width: pt,
                          height: pt,
                        },
                      });
                    }}
                  />
                  <label>角度(°):</label>
                  <input
                    type="number"
                    min="-45"
                    max="45"
                    value={selectedPlaced.position.rotation || 0}
                    onChange={(e) => {
                      const rot = parseFloat(e.target.value) || 0;
                      handleUpdateStamp(selectedPlaced.id, {
                        ...selectedPlaced,
                        position: {
                          ...selectedPlaced.position,
                          rotation: rot,
                        },
                      });
                    }}
                  />
                </div>
                <div className="adjuster-row">
                  <label>濃さ(透過): {Math.round((selectedPlaced.position.opacity ?? 0.92) * 100)}%</label>
                  <input
                    type="range"
                    min="0.3"
                    max="1"
                    step="0.02"
                    value={selectedPlaced.position.opacity ?? 0.92}
                    onChange={(e) => {
                      handleUpdateStamp(selectedPlaced.id, {
                        ...selectedPlaced,
                        position: {
                          ...selectedPlaced.position,
                          opacity: parseFloat(e.target.value),
                        },
                      });
                    }}
                  />
                </div>
              </div>
            )}

            {placedStamps.length === 0 ? (
              <p className="empty-hint">
                「💮 現在のページにこの印鑑を押す」ボタンを押すか、中央のページプレビュー上をクリックすると印鑑が配置されます。
              </p>
            ) : (
              <div className="stamps-list">
                {placedStamps.map((stamp, idx) => (
                  <div
                    key={stamp.id}
                    className={`stamp-item ${stamp.id === selectedStampId ? 'selected' : ''}`}
                    onClick={() => {
                      handleSelectPlacedStamp(stamp.id);
                      setCurrentPage(stamp.pageNumber);
                    }}
                  >
                    <div className="stamp-item-info">
                      <strong>
                        #{idx + 1} P.{stamp.pageNumber}
                      </strong>{' '}
                      <span>{stamp.config.text.replace(/\r?\n/g, ' ')}</span>
                      <small>
                        ({Math.round((stamp.position.width * 25.4) / 72)}mm)
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveStamp(stamp.id);
                      }}
                      className="remove-button"
                      title="削除"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {rawPdfBytes && (
              <div className="bottom-save-stack">
                <button
                  type="button"
                  onClick={handleDownloadStampedPDF}
                  disabled={isProcessing || placedStamps.length === 0}
                  className="export-button"
                >
                  {isProcessing ? '処理中...' : '📥 押印済みPDFをダウンロード'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveStampedPDFToDrive}
                  disabled={isProcessing || placedStamps.length === 0}
                  className="export-drive-button"
                >
                  {isProcessing ? '保存中...' : '☁️ Googleドライブに直接保存'}
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
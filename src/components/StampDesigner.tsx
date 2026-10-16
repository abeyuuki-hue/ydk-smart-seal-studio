/**
 * YDK スマート電子印鑑スタジオ - フルスペック印鑑デザイナー
 * - プリセット11種ワンクリック切替 + ライブ印影ミニモニター搭載
 * - 5大印種タブ (代表者印 / 会社角印 / 認印・実印 / 日付データネーム印 / 自由印・画像印)
 * - 印影XML (.uo3, .xio, .0ni, .l1u, .zlw, .xml) ＆ 印影画像 (.bmp, .png) 読込対応
 */

import React, { useEffect, useRef } from 'react';
import { StampConfig, StampType } from '../types/stamp';
import {
  presetStamps,
  getStampTemplate,
  parseMakeestampXml,
  getTodayStampDate,
} from '../utils/stampTemplates';
import { drawStampOnCanvas } from '../utils/stampRenderer';
import '../styles/StampDesigner.css';

interface StampDesignerProps {
  stamp: StampConfig;
  onStampChange: (stamp: StampConfig) => void;
  onQuickStampToPage?: () => void;
}

const SEAL_FONTS = [
  { value: 'Ｃ＆Ｇ P半古印', label: 'P半古印体（角印・認印標準）' },
  { value: 'Ｃ＆Ｇ半漢印', label: '半漢印体（代表者丸印・実印標準）' },
  { value: '篆書体風', label: '篆書体（重厚・法人実印向け）' },
  { value: '行書体風', label: '行書体（流麗・ビジネス印向け）' },
  { value: 'ＭＳ 明朝', label: '明朝体（ビジネス・日付印）' },
  { value: 'ＭＳ ゴシック', label: 'ゴシック体（データ印・数字印）' },
];

const SEAL_COLORS = [
  { value: 'ffd80016', hex: '#d80016', label: '本朱色（標準）' },
  { value: 'ffe62e00', hex: '#e62e00', label: '鮮朱色（黄口）' },
  { value: 'ffb91c1c', hex: '#b91c1c', label: '濃赤（ダークレッド）' },
  { value: 'ff1d4ed8', hex: '#1d4ed8', label: 'ビジネス青（検印・請求書）' },
  { value: 'ff1e293b', hex: '#1e293b', label: '黒印（モノクロ帳票用）' },
];

export const StampDesigner: React.FC<StampDesignerProps> = ({
  stamp,
  onStampChange,
  onQuickStampToPage,
}) => {
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const miniCanvasRef = useRef<HTMLCanvasElement>(null);
  const stampSig = JSON.stringify(stamp);

  useEffect(() => {
    const renderMini = () => {
      if (miniCanvasRef.current) {
        drawStampOnCanvas(miniCanvasRef.current, stamp, 96, 96);
      }
    };
    renderMini();
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      (document as any).fonts.ready.then(renderMini);
    }
  }, [stampSig]);

  const handleTypeChange = (type: StampType) => {
    const newTemplate = getStampTemplate(type);
    onStampChange({
      ...newTemplate,
      id: `custom-${type}-${Date.now()}`,
    });
  };

  const handlePresetSelect = (preset: StampConfig) => {
    onStampChange(JSON.parse(JSON.stringify(preset)));
  };

  const updateField = <K extends keyof StampConfig>(key: K, value: StampConfig[K]) => {
    const updated: StampConfig = { ...stamp, [key]: value };
    // 実物スキャンプリセットで文字・書体・枠・向きを編集した場合はリアルタイム描画できるようベクター印へ自動切替
    const vectorTriggerKeys: Array<keyof StampConfig> = [
      'text',
      'centerText',
      'fontName',
      'fontBold',
      'direction',
      'frameFigure',
      'outlined',
      'stretchText',
      'thickness',
      'fontRatio',
    ];
    if (updated.customImageDataUrl && vectorTriggerKeys.includes(key)) {
      delete updated.customImageDataUrl;
      if (updated.type === 'user' && updated.frameFigure === 3) {
        updated.type = 'business';
        updated.frameFigure = 0;
      }
    }
    onStampChange(updated);
  };

  // XMLファイルのインポート (.uo3, .xio, .0ni, .l1u, .zlw, .xml)
  const handleXmlImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseMakeestampXml(text, file.name);
      onStampChange(parsed);
    } catch (err: any) {
      alert(`印鑑XMLファイルの読み込みに失敗しました: ${err?.message || err}`);
    } finally {
      e.target.value = '';
    }
  };

  // BMP / PNG 印影画像のインポート（白背景を自動透過処理）
  const handleImageImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r > 235 && g > 235 && b > 235) {
            data[i + 3] = 0;
          } else {
            const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b));
            if (maxDiff > 25 && r > g) {
              data[i + 3] = Math.min(255, Math.round((255 - (g + b) / 2) * 1.4));
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);
        const transparentDataUrl = canvas.toDataURL('image/png');
        onStampChange({
          ...stamp,
          id: `img-${Date.now()}`,
          name: `画像印 (${file.name})`,
          type: 'user',
          customImageDataUrl: transparentDataUrl,
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const currentHexColor = '#' + stamp.color.replace('#', '').slice(-6);

  return (
    <div className="stamp-designer">
      <div className="designer-header-row">
        <h2>💮 印鑑デザイン・プリセット設定</h2>
        <div className="import-buttons">
          <button
            type="button"
            className="btn-outline-sm"
            onClick={() => xmlInputRef.current?.click()}
            title="印鑑XML設定ファイル(.uo3/.xio/.0ni/.l1u/.zlw/.xml)を読み込み"
          >
            📂 XML読込
          </button>
          <button
            type="button"
            className="btn-outline-sm"
            onClick={() => imgInputRef.current?.click()}
            title="BMPやPNGの印影画像を白抜き透過して読み込み"
          >
            🖼️ 印影画像読込
          </button>
          <input
            ref={xmlInputRef}
            type="file"
            accept=".xml,.uo3,.xio,.0ni,.l1u,.zlw"
            style={{ display: 'none' }}
            onChange={handleXmlImport}
          />
          <input
            ref={imgInputRef}
            type="file"
            accept=".bmp,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={handleImageImport}
          />
        </div>
      </div>

      {/* 常時見えるライブ印影ミニモニターバー */}
      <div className="designer-live-monitor">
        <div className="mini-canvas-box checkerboard-bg" onClick={onQuickStampToPage} title="クリックでページに押印">
          <canvas ref={miniCanvasRef} width={96} height={96} className="mini-preview-canvas" />
        </div>
        <div className="mini-monitor-info">
          <div className="mini-monitor-title">{stamp.name}</div>
          <div className="mini-monitor-meta">
            実寸 <strong>{stamp.pasteEdge}mm</strong> / {stamp.fontName}
          </div>
          {onQuickStampToPage && (
            <button
              type="button"
              className="btn-mini-stamp-now"
              onClick={onQuickStampToPage}
            >
              💮 現在のページに押す
            </button>
          )}
        </div>
      </div>

      {/* YDK標準プリセット11種ワンクリック選択 */}
      <div className="preset-section">
        <label className="section-label">⚡ YDK・社内標準プリセット（クリックで即時切替）</label>
        <div className="preset-grid">
          {presetStamps.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset-chip ${stamp.id === preset.id ? 'active' : ''}`}
              onClick={() => handlePresetSelect(preset)}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* 5大印種切り替えタブ */}
      <div className="designer-section">
        <label className="section-label">印鑑の種類（5大印種）</label>
        <div className="stamp-type-tabs">
          {(
            [
              { type: 'president', label: '代表者印(丸)' },
              { type: 'business', label: '会社角印・枠印' },
              { type: 'mitome', label: '認印・実印' },
              { type: 'datename', label: '日付データ印' },
              { type: 'user', label: '自由印・実物印' },
            ] as { type: StampType; label: string }[]
          ).map((item) => (
            <button
              key={item.type}
              type="button"
              className={`tab-btn ${stamp.type === item.type ? 'active' : ''}`}
              onClick={() => handleTypeChange(item.type)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 印種別の文字入力フィールド */}
      {stamp.type === 'president' && (
        <>
          <div className="designer-section">
            <label className="section-label">外周回文テキスト（時計回り配置）</label>
            <input
              type="text"
              value={stamp.text}
              onChange={(e) => updateField('text', e.target.value)}
              className="text-input"
              placeholder="例: 株式会社YDKリノベーション代表者印"
            />
          </div>
          <div className="designer-section two-col">
            <div>
              <label className="section-label">内円テキスト（改行で列分け）</label>
              <textarea
                value={stamp.centerText || ''}
                onChange={(e) => updateField('centerText', e.target.value)}
                className="text-area-input"
                rows={2}
                placeholder={'代表取\n締役印'}
              />
            </div>
            <div>
              <label className="section-label">内円文字の向き＆開始点</label>
              <select
                value={stamp.centerDirection ?? 0}
                onChange={(e) => updateField('centerDirection', Number(e.target.value))}
                className="select-input"
              >
                <option value={0}>縦書き（標準）</option>
                <option value={1}>横書き</option>
              </select>
              <label className="checkbox-inline" style={{ marginTop: '8px' }}>
                <input
                  type="checkbox"
                  checked={stamp.visibleStartPoint !== false}
                  onChange={(e) => updateField('visibleStartPoint', e.target.checked)}
                />
                <span>下部中央に開始点「・」を表示</span>
              </label>
            </div>
          </div>
        </>
      )}

      {(stamp.type === 'business' || stamp.type === 'mitome' || stamp.type === 'user') && (
        <div className="designer-section">
          <div className="label-row">
            <label className="section-label">印面テキスト（改行で複数行・複数列）</label>
            {stamp.customImageDataUrl && (
              <button
                type="button"
                className="btn-clear-img"
                onClick={() => updateField('customImageDataUrl', undefined)}
              >
                文字編集モードへ切替
              </button>
            )}
          </div>
          <textarea
            value={stamp.text}
            onChange={(e) => updateField('text', e.target.value)}
            className="text-area-input"
            rows={3}
            placeholder={'株式会社\nYDK\nリノベー\nション印'}
          />
        </div>
      )}

      {stamp.type === 'datename' && (
        <div className="designer-section three-col">
          <div>
            <label className="section-label">上段テキスト</label>
            <input
              type="text"
              value={stamp.text}
              onChange={(e) => updateField('text', e.target.value)}
              className="text-input"
              placeholder="YDKリノベ"
            />
          </div>
          <div>
            <label className="section-label">
              中央日付{' '}
              <button
                type="button"
                className="btn-today-mini"
                onClick={() => updateField('dateText', getTodayStampDate())}
              >
                今日
              </button>
            </label>
            <input
              type="text"
              value={stamp.dateText || getTodayStampDate()}
              onChange={(e) => updateField('dateText', e.target.value)}
              className="text-input"
              placeholder="'26.10.16"
            />
          </div>
          <div>
            <label className="section-label">下段テキスト</label>
            <input
              type="text"
              value={stamp.bottomText || ''}
              onChange={(e) => updateField('bottomText', e.target.value)}
              className="text-input"
              placeholder="阿部"
            />
          </div>
        </div>
      )}

      {/* 書体・向き・枠形状 */}
      <div className="designer-section two-col">
        <div>
          <label className="section-label">印章フォント（書体）</label>
          <select
            value={stamp.fontName}
            onChange={(e) => updateField('fontName', e.target.value)}
            className="select-input"
          >
            {SEAL_FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {stamp.type !== 'president' && stamp.type !== 'datename' && (
          <div>
            <label className="section-label">文字の並び方向</label>
            <select
              value={stamp.direction ?? 0}
              onChange={(e) => updateField('direction', Number(e.target.value))}
              className="select-input"
            >
              <option value={0}>縦書き（右から左）</option>
              <option value={1}>横書き（上から下）</option>
            </select>
          </div>
        )}

        {stamp.type === 'datename' && (
          <div>
            <label className="section-label">日付印の外枠形状</label>
            <select
              value={stamp.frameFigure ?? 0}
              onChange={(e) => updateField('frameFigure', Number(e.target.value))}
              className="select-input"
            >
              <option value={0}>丸型データネーム印</option>
              <option value={1}>角型データネーム印</option>
            </select>
          </div>
        )}
      </div>

      {/* 枠形状 & 均等割付オプション */}
      {(stamp.type === 'business' || stamp.type === 'mitome' || stamp.type === 'user') && (
        <div className="designer-section two-col">
          <div>
            <label className="section-label">外枠の形状 (frameFigure)</label>
            <select
              value={stamp.frameFigure ?? 0}
              onChange={(e) => updateField('frameFigure', Number(e.target.value))}
              className="select-input"
            >
              {stamp.type === 'mitome' ? (
                <>
                  <option value={0}>丸印（正円）</option>
                  <option value={1}>小判印（楕円）</option>
                  <option value={3}>枠なし</option>
                </>
              ) : (
                <>
                  <option value={0}>正方形角印（角丸）</option>
                  <option value={1}>丸・楕円枠</option>
                  <option value={2}>長方形ビジネス枠</option>
                  <option value={3}>枠なし</option>
                </>
              )}
            </select>
          </div>
          <div className="checkbox-col">
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={stamp.stretchText ?? true}
                onChange={(e) => updateField('stretchText', e.target.checked)}
              />
              <span>均等割付（枠いっぱいに文字配置）</span>
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={stamp.fontBold}
                onChange={(e) => updateField('fontBold', e.target.checked)}
              />
              <span>太字ストローク強調</span>
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={stamp.outlined}
                onChange={(e) => updateField('outlined', e.target.checked)}
              />
              <span>白抜き文字（アウトライン）</span>
            </label>
          </div>
        </div>
      )}

      {/* 朱肉カラー設定 */}
      <div className="designer-section">
        <label className="section-label">朱肉・インキ色</label>
        <div className="color-selector-row">
          {SEAL_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`color-swatch-btn ${
                stamp.color.toLowerCase() === c.value.toLowerCase() ? 'active' : ''
              }`}
              style={{ backgroundColor: c.hex }}
              onClick={() => updateField('color', c.value)}
              title={c.label}
            >
              <span className="swatch-label">{c.label.split('（')[0]}</span>
            </button>
          ))}
          <input
            type="color"
            value={currentHexColor}
            onChange={(e) => updateField('color', 'ff' + e.target.value.replace('#', ''))}
            className="color-picker-native"
            title="自由な色を選択"
          />
        </div>
      </div>

      {/* 実寸サイズ(mm)・文字倍率・枠太さ・傾き */}
      <div className="designer-section two-col">
        <div>
          <label className="section-label">
            印面サイズ（実寸）: <strong>{stamp.pasteEdge} mm</strong>
          </label>
          <input
            type="range"
            min="8"
            max="40"
            step="0.5"
            value={stamp.pasteEdge}
            onChange={(e) => updateField('pasteEdge', parseFloat(e.target.value))}
            className="slider"
          />
          <div className="quick-size-pills">
            {[
              { mm: 9.5, label: '認印9.5' },
              { mm: 13.5, label: '実印13.5' },
              { mm: 18, label: '代表18' },
              { mm: 21, label: '角印21' },
              { mm: 24, label: '大角24' },
            ].map((s) => (
              <button
                key={s.mm}
                type="button"
                className={`pill-btn ${stamp.pasteEdge === s.mm ? 'active' : ''}`}
                onClick={() => updateField('pasteEdge', s.mm)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="section-label">
            文字サイズ比率: <strong>{stamp.fontRatio}%</strong>
          </label>
          <input
            type="range"
            min="60"
            max="160"
            value={stamp.fontRatio}
            onChange={(e) => updateField('fontRatio', parseFloat(e.target.value))}
            className="slider"
          />
          <label className="section-label" style={{ marginTop: '8px' }}>
            外枠の太さ: <strong>{stamp.thickness}</strong> / 傾き:{' '}
            <strong>{stamp.localRotateDegree || 0}°</strong>
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={stamp.thickness}
              onChange={(e) => updateField('thickness', parseFloat(e.target.value))}
              className="slider"
              title="枠線の太さ"
            />
            <input
              type="range"
              min="-15"
              max="15"
              step="1"
              value={stamp.localRotateDegree || 0}
              onChange={(e) => updateField('localRotateDegree', parseFloat(e.target.value))}
              className="slider"
              title="押し傾き角度（リアルな傾き演出）"
            />
          </div>
        </div>
      </div>

      {/* リアル朱肉かすれ・にじみ・枠欠け設定 */}
      <div className="designer-section kasumi-box">
        <div className="kasumi-checks">
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={stamp.clear1}
              onChange={(e) => updateField('clear1', e.target.checked)}
            />
            <span>✨ 朱肉かすれ (clear1)</span>
          </label>
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={stamp.clipFrame}
              onChange={(e) => updateField('clipFrame', e.target.checked)}
            />
            <span>枠欠け効果 (clipFrame)</span>
          </label>
        </div>

        <div className="two-col" style={{ marginTop: '8px' }}>
          <div>
            <label className="section-label">
              かすれ強度: <strong>{stamp.kasumiLevel ?? 30}%</strong>
            </label>
            <input
              type="range"
              min="0"
              max="85"
              value={stamp.kasumiLevel ?? 30}
              disabled={!stamp.clear1}
              onChange={(e) => updateField('kasumiLevel', parseFloat(e.target.value))}
              className="slider"
            />
          </div>
          <div>
            <label className="section-label">
              インクにじみ (blur): <strong>{stamp.blur}%</strong>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={stamp.blur}
              onChange={(e) => updateField('blur', parseFloat(e.target.value))}
              className="slider"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
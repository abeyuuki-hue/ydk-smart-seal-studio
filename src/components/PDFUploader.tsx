/**
 * PDFファイル選択・ドラッグ＆ドロップ・Googleドライブ読込・A4サンプル生成バー
 */

import React, { useRef, useState } from 'react';
import { DriveFileInfo } from '../types/stamp';
import {
  isGasEnvironment,
  listGoogleDrivePDFs,
  fetchGoogleDrivePDFBase64,
} from '../utils/pdfProcessor';
import '../styles/PDFUploader.css';

interface PDFUploaderProps {
  onPDFSelect: (file: File) => void;
  onDrivePDFSelect: (fileName: string, base64Data: string) => void;
  onCreateSamplePDF: () => void;
  fileName?: string;
  disabled?: boolean;
}

export const PDFUploader: React.FC<PDFUploaderProps> = ({
  onPDFSelect,
  onDrivePDFSelect,
  onCreateSamplePDF,
  fileName,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFileInfo[]>([]);
  const [driveQuery, setDriveQuery] = useState('');

  const processSelectedFile = (file: File) => {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('PDFファイル（.pdf）を選択してください');
      return;
    }
    setError(null);
    onPDFSelect(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  // Googleドライブ内のPDF一覧を取得
  const handleOpenDrivePicker = async (search: string = '') => {
    setShowDriveModal(true);
    setIsLoading(true);
    setError(null);
    try {
      const files = await listGoogleDrivePDFs(search);
      setDriveFiles(files);
    } catch (err: any) {
      setError(err?.message || 'Googleドライブからの一覧取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // Googleドライブ上の特定PDFを選択して読み込み
  const handleSelectDriveFile = async (file: DriveFileInfo) => {
    setIsLoading(true);
    setError(null);
    try {
      const { fileName: fName, base64 } = await fetchGoogleDrivePDFBase64(file.id);
      onDrivePDFSelect(fName, base64);
      setShowDriveModal(false);
    } catch (err: any) {
      setError(err?.message || 'GoogleドライブのPDF読込に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`pdf-uploader ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={disabled}
      />

      <div className="uploader-bar-inner">
        <div className="current-doc-badge">
          <span className="doc-icon">📄</span>
          <div className="doc-meta">
            <span className="doc-label">表示中の書類プレビュー</span>
            <strong className="doc-filename">
              {fileName || 'YDK_押印テスト用サンプル帳票_A4.pdf'}
            </strong>
          </div>
        </div>

        <div className="uploader-btn-group">
          <button
            type="button"
            className="upload-button primary-upload-btn"
            onClick={() => !disabled && fileInputRef.current?.click()}
            disabled={disabled || isLoading}
          >
            📂 PDFファイルを開く・差替 (ドラッグ＆ドロップ可)
          </button>

          {isGasEnvironment() && (
            <button
              type="button"
              className="upload-button drive-btn"
              onClick={() => handleOpenDrivePicker(driveQuery)}
              disabled={disabled || isLoading}
            >
              ☁️ ドライブ内PDF選択
            </button>
          )}

          <button
            type="button"
            className="upload-button sample-btn"
            onClick={onCreateSamplePDF}
            disabled={disabled || isLoading}
          >
            🧪 A4サンプル帳票リセット
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showDriveModal && (
        <div className="drive-modal-backdrop" onClick={() => setShowDriveModal(false)}>
          <div className="drive-modal" onClick={(e) => e.stopPropagation()}>
            <div className="drive-modal-header">
              <h4>☁️ Googleドライブ内のPDFファイル</h4>
              <button type="button" onClick={() => setShowDriveModal(false)}>
                ✕
              </button>
            </div>
            <div className="drive-search-bar">
              <input
                type="text"
                value={driveQuery}
                onChange={(e) => setDriveQuery(e.target.value)}
                placeholder="PDFファイル名で検索（例: 請求書, 契約書）"
              />
              <button type="button" onClick={() => handleOpenDrivePicker(driveQuery)}>
                検索
              </button>
            </div>
            <div className="drive-file-list">
              {isLoading ? (
                <p>Googleドライブを検索中...</p>
              ) : driveFiles.length === 0 ? (
                <p>該当するPDFが見つかりませんでした</p>
              ) : (
                driveFiles.map((f) => (
                  <div
                    key={f.id}
                    className="drive-file-item"
                    onClick={() => handleSelectDriveFile(f)}
                  >
                    <span className="drive-file-name">📄 {f.name}</span>
                    <span className="drive-file-date">{f.updatedTime}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
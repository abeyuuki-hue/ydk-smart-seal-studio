/**
 * パパッと電子印鑑3 PRO (Makeestamp3Pro v3.0.14) 完全互換 型定義
 */

export type StampType = 'president' | 'business' | 'mitome' | 'datename' | 'user';

export type MakeestampXmlClass =
  | 'PresidentStamp'
  | 'BusinessStamp'
  | 'MitomeStamp'
  | 'DateNameStamp'
  | 'UserStamp';

export interface StampConfig {
  id: string;
  name?: string; // プリセット表示名
  type: StampType;
  xmlClass?: MakeestampXmlClass;
  text: string; // メインテキスト（代表者印では外周回文、角印・認印では印面文字、日付印では上段文字）
  fontName: string; // 例: "Ｃ＆Ｇ半漢印", "Ｃ＆Ｇ P半古印", "ＭＳ ゴシック", "ＭＳ 明朝"
  fontBold: boolean; // isfontbold
  color: string; // ARGB 16進数カラーコード (例: "ffd80016")
  thickness: number; // 枠線の太さ (1〜10)
  blur: number; // ぼかし・にじみ (0〜200)
  pasteEdge: number; // 実寸サイズ (mm単位: 認印9.5, 代表者印18.0, 角印21.0/24.0 等)
  outlined: boolean; // isoutlined (中抜き文字)
  clear1: boolean; // clear1 (印影かすれ有効化)
  kasumiLevel?: number; // かすれ強度 (0〜100, デフォルト35)
  clipFrame: boolean; // clipFrame (枠の微細欠け効果)
  fontRatio: number; // フォントサイズ比率 (50〜200)
  direction?: number; // 0: 縦書き, 1: 横書き
  stretchText?: boolean; // 均等割付・文字伸縮
  frameFigure?: number; // 0: 標準(丸/角), 1: 楕円(小判)/丸枠, 2: 長方形, 3: 枠なし
  localRotateDegree?: number; // 印面回転角度
  // PresidentStamp (代表者印) 専用属性
  visibleStartPoint?: boolean; // 外周回文の開始点マーク「・」表示
  centerText?: string; // 内円の中央テキスト (例: "代表取\r\n締役印")
  centerRatio?: number; // 中央テキスト比率
  outsideAdjustment?: number; // 外周文字配置調整
  localClear1?: boolean; // 内側かすれ
  centerDirection?: number; // 0: 縦書き, 1: 横書き
  // DateNameStamp (日付データネーム印) 専用属性
  dateText?: string; // 中段の日付文字列 (例: "'26.10.16" または "2026.10.16")
  bottomText?: string; // 下段の氏名文字列 (例: "阿部")
  // UserStamp / 実物透過印影画像オーバーレイ用
  customImageDataUrl?: string; // 透過PNG等のBase64データURL
}

export interface StampPosition {
  x: number; // PDFページ内のX座標（PDF pt単位: 左上原点）
  y: number; // PDFページ内のY座標（PDF pt単位: 左上原点）
  width: number; // スタンプの幅（PDF pt単位, 1mm = 2.83465pt）
  height: number; // スタンプの高さ（PDF pt単位）
  rotation?: number; // 回転角度（度数法）
  opacity?: number; // 不透明度 (0.1〜1.0)
}

export interface PDFStamp {
  id: string;
  config: StampConfig;
  position: StampPosition;
  pageNumber: number; // ページ番号（1-indexed）
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  updatedTime: string;
  size?: number;
  url?: string;
}

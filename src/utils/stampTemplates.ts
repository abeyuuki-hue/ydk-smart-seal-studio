/**
 * パパッと電子印鑑3 PRO (Makeestamp3Pro v3.0.14) プリセット＆XMLパーサー
 * OneDrive/GING/Makeestamp3Pro 内の全5種XML定義 + YDK公式角印・日付印・ビジネス印を完全収録
 */

import { StampConfig, StampType, MakeestampXmlClass } from '../types/stamp';
import { OFFICIAL_YDK_SEAL_BASE64 } from './officialSealBase64';

/** 今日の日付を 'YY.MM.DD 形式で返す */
export const getTodayStampDate = (): string => {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `'${y}.${m}.${d}`;
};

/** mm（ミリメートル）をPDFポイント（72 DPI: 1mm = 2.83465pt）へ変換 */
export const mmToPt = (mm: number): number => {
  return Math.round(mm * (72 / 25.4) * 10) / 10;
};

/**
 * Makeestamp3Pro 実ファイル完全再現プリセット一覧
 */
export const presetStamps: StampConfig[] = [
  // 1. 3kbfoyps.uo3 (株式会社YDKリノベーション 代表者丸印 18mm)
  {
    id: 'preset-ydk-president',
    name: 'YDK 代表者印（丸印 18mm）[.uo3]',
    type: 'president',
    xmlClass: 'PresidentStamp',
    text: '株式会社YDKリノベーション代表者印',
    centerText: '代表取\n締役印',
    fontName: 'Ｃ＆Ｇ半漢印',
    fontBold: true,
    color: 'ffd80016',
    thickness: 5,
    blur: 100,
    pasteEdge: 18,
    outlined: false,
    clear1: true,
    kasumiLevel: 30,
    clipFrame: true,
    fontRatio: 121,
    centerRatio: 100,
    outsideAdjustment: 0,
    localClear1: true,
    centerDirection: 0,
    visibleStartPoint: true,
    localRotateDegree: 0,
  },
  // 2. YDKリノベーションネット印.bmp 完全再現 (4行均等割付 会社角印 21mm)
  {
    id: 'preset-ydk-kakuin-4line',
    name: 'YDK 会社角印（4行・印付 21mm）',
    type: 'business',
    xmlClass: 'BusinessStamp',
    text: '株式会社\nYDK\nリノベー\nション印',
    fontName: 'Ｃ＆Ｇ P半古印',
    fontBold: true,
    color: 'ffd80016',
    thickness: 4,
    blur: 60,
    pasteEdge: 21,
    outlined: false,
    clear1: true,
    kasumiLevel: 28,
    clipFrame: true,
    fontRatio: 105,
    direction: 1, // 横書き4段
    frameFigure: 0, // 角印枠
    stretchText: true,
    localRotateDegree: 0,
  },
  // 3. YDK公式実物社印（透過PNGスキャン印影）
  {
    id: 'preset-ydk-official-scan',
    name: 'YDK 公式透過角印（実物印影 21mm）',
    type: 'user',
    xmlClass: 'UserStamp',
    text: '株式会社\nYDK\nリノベー\nション印',
    fontName: 'Ｃ＆Ｇ P半古印',
    fontBold: true,
    color: 'ffd80016',
    thickness: 4,
    blur: 0,
    pasteEdge: 21,
    outlined: false,
    clear1: false,
    kasumiLevel: 0,
    clipFrame: false,
    fontRatio: 100,
    direction: 1,
    frameFigure: 3,
    stretchText: true,
    customImageDataUrl: OFFICIAL_YDK_SEAL_BASE64,
  },
  // 4. sfgt5hfn.xio (株式会社YDKリノベーション 3行角印 18mm)
  {
    id: 'preset-ydk-business-3line',
    name: 'YDK 角印（3行横 18mm）[.xio]',
    type: 'business',
    xmlClass: 'BusinessStamp',
    text: '株式会社\nYDK\nリノベーション',
    fontName: 'Ｃ＆Ｇ P半古印',
    fontBold: true,
    color: 'ffd80016',
    thickness: 3,
    blur: 100,
    pasteEdge: 18,
    outlined: false,
    clear1: true,
    kasumiLevel: 30,
    clipFrame: false,
    fontRatio: 100,
    direction: 1,
    frameFigure: 0,
    stretchText: true,
    localRotateDegree: 0,
  },
  // 4b. やればできるこJAPAN株式会社 角印 (21mm)
  {
    id: 'preset-ydk-japan-kakuin',
    name: 'やればできるこJAPAN 会社角印（21mm）',
    type: 'business',
    xmlClass: 'BusinessStamp',
    text: 'やればで\nきるこ\nJAPAN\n株式会社印',
    fontName: 'Ｃ＆Ｇ P半古印',
    fontBold: true,
    color: 'ffd80016',
    thickness: 4,
    blur: 60,
    pasteEdge: 21,
    outlined: false,
    clear1: true,
    kasumiLevel: 28,
    clipFrame: true,
    fontRatio: 100,
    direction: 1,
    frameFigure: 0,
    stretchText: true,
    localRotateDegree: 0,
  },
  // 4c. やればできるこJAPAN株式会社 代表者丸印 (18mm)
  {
    id: 'preset-ydk-japan-president',
    name: 'やればできるこJAPAN 代表者印（18mm）',
    type: 'president',
    xmlClass: 'PresidentStamp',
    text: 'やればできるこJAPAN株式会社代表者印',
    centerText: '代表取\n締役印',
    fontName: 'Ｃ＆Ｇ半漢印',
    fontBold: true,
    color: 'ffd80016',
    thickness: 5,
    blur: 100,
    pasteEdge: 18,
    outlined: false,
    clear1: true,
    kasumiLevel: 30,
    clipFrame: true,
    fontRatio: 118,
    centerRatio: 100,
    outsideAdjustment: 0,
    localClear1: true,
    centerDirection: 0,
    visibleStartPoint: true,
    localRotateDegree: 0,
  },
  // 5. abnyydeu.l1u (阿部 認印 9.5mm)
  {
    id: 'preset-abe-mitome',
    name: '阿部 認印（丸印 9.5mm）[.l1u]',
    type: 'mitome',
    xmlClass: 'MitomeStamp',
    text: '阿部',
    fontName: 'Ｃ＆Ｇ P半古印',
    fontBold: false,
    color: 'ffd80016',
    thickness: 3,
    blur: 100,
    pasteEdge: 9.5,
    outlined: false,
    clear1: true,
    kasumiLevel: 25,
    clipFrame: true,
    fontRatio: 143,
    direction: 0, // 縦書き
    frameFigure: 0, // 丸枠
    localRotateDegree: 0,
  },
  // 6. 阿部裕樹 銀行印・実印 (13.5mm)
  {
    id: 'preset-abe-full',
    name: '阿部裕樹 実印（13.5mm）',
    type: 'mitome',
    xmlClass: 'MitomeStamp',
    text: '阿部\n裕樹',
    fontName: 'Ｃ＆Ｇ半漢印',
    fontBold: true,
    color: 'ffd80016',
    thickness: 3.5,
    blur: 80,
    pasteEdge: 13.5,
    outlined: false,
    clear1: true,
    kasumiLevel: 25,
    clipFrame: true,
    fontRatio: 115,
    direction: 0, // 縦書き2列
    frameFigure: 0,
    localRotateDegree: 0,
  },
  // 7. データネーム日付印 (YDKリノベ / 日付 / 阿部)
  {
    id: 'preset-ydk-datename',
    name: 'YDK データネーム日付印（15mm）',
    type: 'datename',
    xmlClass: 'DateNameStamp',
    text: 'YDKリノベ',
    dateText: getTodayStampDate(),
    bottomText: '阿部',
    fontName: 'Ｃ＆Ｇ P半古印',
    fontBold: true,
    color: 'ffd80016',
    thickness: 3,
    blur: 50,
    pasteEdge: 15,
    outlined: false,
    clear1: true,
    kasumiLevel: 20,
    clipFrame: false,
    fontRatio: 100,
    frameFigure: 0, // 0: 丸型日付印, 1: 角型日付印
    localRotateDegree: 0,
  },
  // 8. ule41ckq.0ni (飛田和塗装印 24mm 縦書き角印)
  {
    id: 'preset-tobitawa-kakuin',
    name: '飛田和塗装印（角印 24mm）[.0ni]',
    type: 'business',
    xmlClass: 'BusinessStamp',
    text: '飛田和\n塗装印',
    fontName: 'Ｃ＆Ｇ半漢印',
    fontBold: true,
    color: 'ffd80016',
    thickness: 6,
    blur: 100,
    pasteEdge: 24,
    outlined: false,
    clear1: true,
    kasumiLevel: 35,
    clipFrame: true,
    fontRatio: 114,
    direction: 0, // 縦書き
    frameFigure: 0,
    stretchText: true,
    localRotateDegree: 0,
  },
  // 9. ビジネス印（請求書在中・横長）
  {
    id: 'preset-invoice-enclosed',
    name: 'ビジネス印「請求書在中」',
    type: 'business',
    xmlClass: 'BusinessStamp',
    text: '請求書在中',
    fontName: 'Ｃ＆Ｇ P半古印',
    fontBold: true,
    color: 'ff1d4ed8', // 青印
    thickness: 3.5,
    blur: 40,
    pasteEdge: 24,
    outlined: false,
    clear1: true,
    kasumiLevel: 20,
    clipFrame: false,
    fontRatio: 95,
    direction: 1,
    frameFigure: 2, // 長方形枠
    stretchText: true,
    localRotateDegree: 0,
  },
  // 10. ビジネス印（承認済）
  {
    id: 'preset-approved',
    name: 'ビジネス印「承認済」',
    type: 'business',
    xmlClass: 'BusinessStamp',
    text: '承認済',
    fontName: 'Ｃ＆Ｇ半漢印',
    fontBold: true,
    color: 'ffd80016',
    thickness: 3.5,
    blur: 40,
    pasteEdge: 16,
    outlined: false,
    clear1: true,
    kasumiLevel: 20,
    clipFrame: true,
    fontRatio: 100,
    direction: 1,
    frameFigure: 1, // 丸・楕円枠
    stretchText: false,
    localRotateDegree: 0,
  },
  // 11. 45tmpzvm.zlw (ユーザー印 232)
  {
    id: 'preset-user-232',
    name: 'ユーザー印「232」（36mm）[.zlw]',
    type: 'user',
    xmlClass: 'UserStamp',
    text: '232',
    fontName: 'ＭＳ ゴシック',
    fontBold: false,
    color: 'ffd80016',
    thickness: 1,
    blur: 0,
    pasteEdge: 36,
    outlined: false,
    clear1: true,
    kasumiLevel: 15,
    clipFrame: true,
    fontRatio: 70,
    direction: 1,
    frameFigure: 3, // 枠なし
    stretchText: true,
    localRotateDegree: 0,
  },
];

export const stampTemplates: Record<StampType, StampConfig> = {
  president: presetStamps.find((p) => p.id === 'preset-ydk-president') || presetStamps[0],
  business: presetStamps.find((p) => p.id === 'preset-ydk-kakuin-4line') || presetStamps[1],
  mitome: presetStamps.find((p) => p.id === 'preset-abe-mitome') || presetStamps[0],
  datename: presetStamps.find((p) => p.id === 'preset-ydk-datename') || presetStamps[0],
  user: presetStamps.find((p) => p.id === 'preset-ydk-official-scan') || presetStamps[0],
};

export const getStampTemplate = (type: StampType): StampConfig => {
  return JSON.parse(JSON.stringify(stampTemplates[type]));
};

export const getPresetById = (id: string): StampConfig => {
  const found = presetStamps.find((p) => p.id === id) || presetStamps[0];
  return JSON.parse(JSON.stringify(found));
};

/**
 * カラーコード（ARGB 8桁またはRGB 6桁）を RGB に変換
 */
export const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const cleanHex = hex.replace('#', '').slice(-6);
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 216, g: 0, b: 22 }; // Makeestamp3Pro標準朱色 #d80016
};

export const rgbToHex = (r: number, g: number, b: number): string => {
  const hex = [r, g, b]
    .map((x) => {
      const h = x.toString(16);
      return h.length === 1 ? '0' + h : h;
    })
    .join('');
  return 'ff' + hex;
};

/**
 * Makeestamp3Pro XMLファイル (.uo3, .xio, .0ni, .l1u, .zlw, .xml) をパースして StampConfig に変換
 */
export const parseMakeestampXml = (xmlText: string, fileName: string = 'imported.xml'): StampConfig => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const root = doc.querySelector('Makeestamp3Pro');
  if (!root) {
    throw new Error('有効なパパッと電子印鑑3 PRO (Makeestamp3Pro) XMLファイルではありません');
  }

  const xmlClass = (root.getAttribute('class') || 'MitomeStamp') as MakeestampXmlClass;
  let type: StampType = 'mitome';
  if (xmlClass === 'PresidentStamp') type = 'president';
  else if (xmlClass === 'BusinessStamp') type = 'business';
  else if (xmlClass === 'DateNameStamp') type = 'datename';
  else if (xmlClass === 'UserStamp') type = 'user';

  const normalizeText = (raw: string | null) =>
    (raw || '').replace(/&#xD;&#xA;/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const clear1 = root.getAttribute('clear1') !== 'false';
  return {
    id: `xml-${Date.now()}`,
    name: `XML読込 (${fileName})`,
    type,
    xmlClass,
    text: normalizeText(root.getAttribute('text')),
    centerText: normalizeText(root.getAttribute('centerText')) || '代表取\n締役印',
    fontName: root.getAttribute('fontName') || 'Ｃ＆Ｇ P半古印',
    fontBold: root.getAttribute('isfontbold') === 'true',
    color: root.getAttribute('col') || 'ffd80016',
    thickness: parseFloat(root.getAttribute('thickness') || '3'),
    blur: parseFloat(root.getAttribute('blur') || '100'),
    pasteEdge: parseFloat(root.getAttribute('pasteEdge') || '18'),
    outlined: root.getAttribute('isoutlined') === 'true',
    clear1,
    kasumiLevel: clear1 ? 30 : 0,
    clipFrame: root.getAttribute('clipFrame') === 'true',
    fontRatio: parseFloat(root.getAttribute('fontRatio') || '100'),
    direction: parseInt(root.getAttribute('direction') || '0', 10),
    stretchText: root.getAttribute('stretchText') === 'true',
    frameFigure: parseInt(root.getAttribute('frameFigure') || '0', 10),
    localRotateDegree: parseFloat(root.getAttribute('localRotateDegree') || '0'),
    visibleStartPoint: root.getAttribute('visibleStartPoint') !== 'false',
    centerRatio: parseFloat(root.getAttribute('centerRatio') || '100'),
    outsideAdjustment: parseFloat(root.getAttribute('outsideAdjustment') || '0'),
    localClear1: root.getAttribute('localClear1') === 'true',
    centerDirection: parseInt(root.getAttribute('centerDirection') || '0', 10),
    dateText: getTodayStampDate(),
    bottomText: '阿部',
  };
};

/**
 * StampConfig を Makeestamp3Pro v3.0.14 互換XML文字列へエクスポート
 */
export const exportMakeestampXml = (config: StampConfig): string => {
  const xmlClass: MakeestampXmlClass =
    config.xmlClass ||
    (config.type === 'president'
      ? 'PresidentStamp'
      : config.type === 'business'
      ? 'BusinessStamp'
      : config.type === 'datename'
      ? 'DateNameStamp'
      : config.type === 'user'
      ? 'UserStamp'
      : 'MitomeStamp');

  const escapeXmlAttr = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\r?\n/g, '&#xD;&#xA;');

  const attrs: string[] = [
    `version="3.0.14"`,
    `class="${xmlClass}"`,
    `text="${escapeXmlAttr(config.text)}"`,
    `fontName="${escapeXmlAttr(config.fontName)}"`,
    `isfontbold="${config.fontBold}"`,
    `col="${config.color}"`,
    `thickness="${config.thickness}"`,
    `blur="${config.blur}"`,
    `pasteEdge="${config.pasteEdge}"`,
    `isoutlined="${config.outlined}"`,
    `clear1="${config.clear1}"`,
    `clipFrame="${config.clipFrame}"`,
    `localRotateDegree="${config.localRotateDegree || 0}"`,
    `fontRatio="${config.fontRatio}"`,
  ];

  if (config.type === 'president') {
    attrs.push(
      `visibleStartPoint="${config.visibleStartPoint !== false}"`,
      `centerText="${escapeXmlAttr(config.centerText || '')}"`,
      `centerRatio="${config.centerRatio || 100}"`,
      `outsideAdjustment="${config.outsideAdjustment || 0}"`,
      `localClear1="${config.localClear1 !== false}"`,
      `centerDirection="${config.centerDirection ?? 0}"`
    );
  } else {
    attrs.push(
      `direction="${config.direction ?? 0}"`,
      `frameFigure="${config.frameFigure ?? 0}"`,
      `stretchText="${config.stretchText ?? false}"`
    );
  }

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<Makeestamp3Pro ${attrs.join(' ')}>\r\n  <transforms />\r\n</Makeestamp3Pro>`;
};
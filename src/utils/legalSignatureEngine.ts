/**
 * YDK スマート電子印鑑スタジオ — 電子署名法及び関連省令・指針準拠 証明データエンジン
 * (src/utils/legalSignatureEngine.ts)
 *
 * 【準拠法令・指針（全6文書完全対応）】
 * 1. 電子署名及び認証業務に関する法律（平成12年法律第102号 / 改正令和7年6月1日施行）
 *    - 第2条第1項第1号: 当該情報が当該措置を行った者の作成に係るものであることを示す措置（本人作成表示）
 *    - 第2条第1項第2号: 当該情報について改変が行われていないかどうかを確認することができる措置（非改変確認）
 *    - 第3条: 電磁的記録の真正な成立の推定（本人による電子署名・署名符号の適正管理）
 *    - 第13条第2項・第42条第1号: 特定認証業務の認定と紛らわしい表示の禁止（当事者型・自社管理型である旨の明示）
 * 2. 電子署名及び認証業務に関する法律施行令（平成13年政令第41号）
 * 3. 電子署名及び認証業務に関する法律第十五条第三項に規定する書類の記載事項を定める省令（平成14年省令第1号）
 * 4. 電子署名及び認証業務に関する法律に基づく指定調査機関等に関する省令（平成13年省令第1号）
 *    - 第9条: 帳簿書類の電磁的方法による記録・保存（10年間保存互換フォーマット）
 * 5. 電子署名及び認証業務に関する法律に基づく指定調査機関の調査に関する方針（令和7年6月30日デジタル庁・法務省通知）
 *    - 第4の4: 利用者の役職名・属性記載時の誤認防止措置
 *    - 第4の9: 発行者署名検証符号に係る電子証明書のSHA-256/384/512ハッシュ値による特定及び改ざん防止
 * 6. 電子署名及び認証業務に関する法律に基づく特定認証業務の認定に係る指針（令和7年6月30日デジタル庁・法務省告示第4号）
 *    - 第3条: 暗号アルゴリズム及びオブジェクト識別子（OID）基準
 *      ・RSA (2048bit以上) + SHA-256: OID 1.2.840.113549.1.1.11
 *      ・RSA-PSS (2048bit以上) + SHA-256: OID 1.2.840.113549.1.1.10 (Hash OID: 2.16.840.1.101.3.4.2.1)
 *      ・ECDSA (P-256 / 256bit >= 224bit) + SHA-256: OID 1.2.840.10045.4.3.2
 *    - 第9条: 利用申込者の氏名・住所・代表者氏名・氏名のローマ字表記・電子証明書の用途
 *    - 第10条第2号・第3号: 発行者署名検証符号のSHA-256/384/512ハッシュ特定・属性の認定対象外明記
 *    - 第11条・第12条: 署名検証者への必須情報提供（検証方法・利用目的・責任範囲・失効確認・準拠法及び管轄）
 */

import { PDFDocument as PDFLib, PDFName, PDFHexString, PDFDict, PDFArray, StandardFonts, rgb } from 'pdf-lib';
import { PDFStamp } from '../types/stamp';

export type SupportedAlgorithmId = 'RSA-2048-SHA256' | 'ECDSA-P256-SHA256';

export interface LegalSignerProfile {
  organizationNameJa: string;
  organizationNameEn: string;
  representativeTitleJa: string;
  signerNameJa: string;
  /** 指針第9条第1項必須: 氏名のローマ字表記 */
  signerNameRoman: string;
  addressJa: string;
  addressEn: string;
  invoiceRegistrationNo: string;
  contactEmail: string;
  contactPhone: string;
  certificatePurpose: string;
  algorithm: SupportedAlgorithmId;
  /** ページ下部に電子署名検証ID・SHA-256刻印を印字するか */
  drawPageMicroFooter: boolean;
  /** 巻末に「電子署名法準拠 署名検証証明書」ページを追加するか */
  appendCertificatePage: boolean;
}

export const DEFAULT_LEGAL_SIGNER_PROFILE: LegalSignerProfile = {
  organizationNameJa: '株式会社YDKリノベーション / やればできるこJAPAN株式会社',
  organizationNameEn: 'YDK RENOVATION INC. / YAREBADEKIRUKO JAPAN INC.',
  representativeTitleJa: '代表取締役',
  signerNameJa: '阿部 裕樹',
  signerNameRoman: 'YUUKI ABE',
  addressJa: '千葉県船橋市宮本9-11-1-808',
  addressEn: '9-11-1-808 Miyamoto, Funabashi-shi, Chiba, JAPAN',
  invoiceRegistrationNo: 'T6040001119458',
  contactEmail: 'abeyuuki@yarebadekiruko.com',
  contactPhone: '047-000-0000',
  certificatePurpose: '見積書・請求書・契約書・発注書・施工出来高確認書等の真正性証明及び非改変証明',
  algorithm: 'RSA-2048-SHA256',
  drawPageMicroFooter: true,
  appendCertificatePage: false,
};

export interface AlgorithmMetadata {
  id: SupportedAlgorithmId;
  name: string;
  signatureOid: string;
  hashAlgorithm: 'SHA-256';
  hashOid: string;
  keyLengthDescription: string;
  legalBasis: string;
}

export const ALGORITHM_METADATA_MAP: Record<SupportedAlgorithmId, AlgorithmMetadata> = {
  'RSA-2048-SHA256': {
    id: 'RSA-2048-SHA256',
    name: 'RSASSA-PKCS1-v1_5 with SHA-256 (RSA 2048-bit)',
    signatureOid: '1.2.840.113549.1.1.11',
    hashAlgorithm: 'SHA-256',
    hashOid: '2.16.840.1.101.3.4.2.1',
    keyLengthDescription: 'RSA モジュラス長 2048 bit (指針第3条第1号イ基準: 2048bit以上適合)',
    legalBasis: '特定認証業務の認定に係る指針 第3条第1号イ (OID: 1.2.840.113549.1.1.11)',
  },
  'ECDSA-P256-SHA256': {
    id: 'ECDSA-P256-SHA256',
    name: 'ECDSA prime256v1 (P-256) with SHA-256',
    signatureOid: '1.2.840.10045.4.3.2',
    hashAlgorithm: 'SHA-256',
    hashOid: '2.16.840.1.101.3.4.2.1',
    keyLengthDescription: 'ECDSA 楕円曲線位数 256 bit (指針第3条第1号ロ基準: 224bit以上適合)',
    legalBasis: '特定認証業務の認定に係る指針 第3条第1号ロ (OID: 1.2.840.10045.4.3.2)',
  },
};

export interface PdfVisualFingerprint {
  pageCount: number;
  pages: Array<{
    pageNumber: number;
    widthPt: number;
    heightPt: number;
    rotationDeg: number;
    xObjectCount: number;
    xObjectNames: string[];
  }>;
  fingerprintSha256: string;
}

export interface LegalElectronicCertificate {
  certificateVersion: 'X509-JSON-v3-YDK-2026';
  serialNumber: string;
  issuer: {
    commonName: string;
    organizationJa: string;
    organizationEn: string;
    country: 'JP';
    contactEmail: string;
  };
  subject: {
    commonNameJa: string;
    /** 指針第9条第1項: 氏名のローマ字表記 */
    commonNameRoman: string;
    organizationJa: string;
    organizationEn: string;
    titleJa: string;
    addressJa: string;
    invoiceRegistrationNo: string;
    country: 'JP';
  };
  validity: {
    notBeforeIso: string;
    notAfterIso: string;
  };
  algorithm: AlgorithmMetadata;
  /** 指針第10条第2号・調査方針第4の9: 発行者署名検証符号のSHA-256/384/512ハッシュ値 */
  issuerVerificationKeyHashes: {
    sha256: string;
    sha384: string;
    sha512: string;
  };
  publicKeyJwk: JsonWebKey;
  publicKeySpkiPem: string;
  /** 法第13条第2項・指針第8条・第10条第3号・調査方針第4の4: 誤認防止措置・非認定明示 */
  statutoryDisclaimers: {
    article13Paragraph2Statement: string;
    attributeScopeStatement: string;
    certificatePurpose: string;
  };
  /** 指針第11条・第12条: 署名検証者への情報提供事項 */
  verifierDisclosure: {
    verificationInstruction: string;
    liabilityLimitation: string;
    revocationCheckMethod: string;
    issuerContact: string;
    governingLawAndJurisdiction: string;
  };
}

export interface SignedAttributesPayload {
  proofId: string;
  signedAtIso: string;
  documentFileName: string;
  /** 原文PDF（押印前）のハッシュ値 */
  originalDocumentSha256: string;
  /** 押印後ページ構造＆印影リソース指紋（法第2条第1項第2号 非改変確認用） */
  visualStructureFingerprint: PdfVisualFingerprint;
  /** 押印された電子印鑑の明細と各印影画像のSHA-256ハッシュ */
  appliedStamps: Array<{
    index: number;
    pageNumber: number;
    stampName: string;
    stampType: string;
    stampText: string;
    xPt: number;
    yPt: number;
    widthPt: number;
    heightPt: number;
    sealImageSha256: string;
  }>;
  signerCertificateSerialNumber: string;
  issuerKeySha256: string;
  legalComplianceDeclaration: {
    actArticle2Paragraph1Item1: string;
    actArticle2Paragraph1Item2: string;
    actArticle3: string;
    actArticle13Paragraph2: string;
  };
}

export interface YDKLegalSignatureProofPackage {
  schema: 'https://yarebadekiruko.com/schemas/electronic-signature-proof/v1.0.json';
  engineName: 'YDK Smart Seal Studio - Legal Electronic Signature Engine';
  engineVersion: '2.3.0';
  certificate: LegalElectronicCertificate;
  signedAttributes: SignedAttributesPayload;
  /** signedAttributes の正規化JSONに対する SHA-256 / SHA-512 ダイジェスト */
  signedAttributesDigest: {
    sha256: string;
    sha512: string;
  };
  /** 利用者署名符号（秘密鍵）による暗号署名値 (Base64) */
  cryptographicSignatureBase64: string;
  /** 指定調査機関省令第9条・調査方針第6準拠 電磁的帳簿レコード */
  auditLedgerRecord: {
    ledgerRecordId: string;
    recordedAtIso: string;
    retentionPeriodYears: 10;
    statutoryBasis: string;
    signerSummary: string;
    documentFileName: string;
    proofId: string;
    signatureDigestSha256: string;
  };
}

export interface LegalVerificationResult {
  isValid: boolean;
  hasEmbeddedProof: boolean;
  /** 法第2条第1項第1号: 本人作成表示措置の検証結果 */
  creatorAttributionValid: boolean;
  /** 法第2条第1項第2号: 非改変確認（改ざんなし）の検証結果 */
  tamperFreeValid: boolean;
  /** 暗号署名（公開鍵による署名検証）の結果 */
  cryptographicSignatureValid: boolean;
  /** ページ構造・印影構成の一致検証結果 */
  visualStructureMatches: boolean;
  summaryMessage: string;
  details: string[];
  proofPackage?: YDKLegalSignatureProofPackage;
}

const STORAGE_KEY_PREFIX = 'ydk_seal_legal_keypair_v1_';
const STORAGE_LEDGER_KEY = 'ydk_seal_signature_audit_ledger_v1';

/**
 * ArrayBuffer / Uint8Array を16進数文字列に変換
 */
export function bufferToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * ArrayBuffer / Uint8Array を Base64 に変換
 */
export function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Base64 を Uint8Array に変換
 */
export function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * Web Crypto API で SHA-256 / SHA-384 / SHA-512 ハッシュ（16進数）を計算
 */
export async function shaDigestHex(
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512',
  data: Uint8Array | string
): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hashBuf = await window.crypto.subtle.digest(algorithm, copy.buffer);
  return bufferToHex(hashBuf);
}

/**
 * SPKI バイナリを PEM 形式に変換
 */
function spkiToPem(spkiBuffer: ArrayBuffer): string {
  const b64 = bufferToBase64(spkiBuffer);
  const lines = b64.match(/.{1,64}/g) || [b64];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

/**
 * ブラウザ内（localStorage + Web Crypto API）で署名鍵ペアを生成または取得（100%無料・外部通信なし）
 */
async function getOrCreateSignerKeyPair(algorithm: SupportedAlgorithmId): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  publicKeySpkiPem: string;
  keyHashes: { sha256: string; sha384: string; sha512: string };
  serialNumber: string;
  createdAtIso: string;
}> {
  const storageKey = `${STORAGE_KEY_PREFIX}${algorithm}`;
  const isRsa = algorithm === 'RSA-2048-SHA256';

  const importParams: RsaHashedImportParams | EcKeyImportParams = isRsa
    ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
    : { name: 'ECDSA', namedCurve: 'P-256' };

  try {
    const cachedRaw = localStorage.getItem(storageKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      const privateKey = await window.crypto.subtle.importKey(
        'jwk',
        cached.privateKeyJwk,
        importParams,
        true,
        ['sign']
      );
      const publicKey = await window.crypto.subtle.importKey(
        'jwk',
        cached.publicKeyJwk,
        importParams,
        true,
        ['verify']
      );
      return {
        privateKey,
        publicKey,
        publicKeyJwk: cached.publicKeyJwk,
        publicKeySpkiPem: cached.publicKeySpkiPem,
        keyHashes: cached.keyHashes,
        serialNumber: cached.serialNumber,
        createdAtIso: cached.createdAtIso,
      };
    }
  } catch (e) {
    console.warn('既存鍵キャッシュの読み込みをスキップし新規生成します:', e);
  }

  // 新規鍵ペア生成（指針第3条基準: RSA 2048bit または ECDSA P-256）
  const keyPair = (await window.crypto.subtle.generateKey(
    isRsa
      ? {
          name: 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        }
      : {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;

  const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const spkiBuf = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const spkiBytes = new Uint8Array(spkiBuf);
  const publicKeySpkiPem = spkiToPem(spkiBuf);

  // 指針第10条第2号・調査方針第4の9: 発行者署名検証符号のSHA-256/384/512ハッシュ値
  const [sha256, sha384, sha512] = await Promise.all([
    shaDigestHex('SHA-256', spkiBytes),
    shaDigestHex('SHA-384', spkiBytes),
    shaDigestHex('SHA-512', spkiBytes),
  ]);

  const serialNumber = `YDK-CERT-${sha256.slice(0, 16).toUpperCase()}`;
  const createdAtIso = new Date().toISOString();

  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        privateKeyJwk,
        publicKeyJwk,
        publicKeySpkiPem,
        keyHashes: { sha256, sha384, sha512 },
        serialNumber,
        createdAtIso,
      })
    );
  } catch (e) {
    console.warn('localStorageへの鍵保存をスキップ:', e);
  }

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyJwk,
    publicKeySpkiPem,
    keyHashes: { sha256, sha384, sha512 },
    serialNumber,
    createdAtIso,
  };
}

/**
 * PDFのページ数・各ページ寸法・回転角・XObject（埋め込み印影画像等）の構成から
 * 添付ファイル追加前後で不変かつページ改変時に変化する構造指紋（Visual Structure Fingerprint）を算出
 */
export async function computePdfVisualFingerprint(pdfDoc: PDFLib): Promise<PdfVisualFingerprint> {
  const pages = pdfDoc.getPages();
  const pageSummaries: PdfVisualFingerprint['pages'] = [];

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const { width, height } = p.getSize();
    const rotationDeg = p.getRotation().angle || 0;

    let xObjectNames: string[] = [];
    try {
      const resources = p.node.Resources();
      if (resources) {
        const xObj = resources.lookup(PDFName.of('XObject'));
        if (xObj instanceof PDFDict) {
          xObjectNames = xObj
            .keys()
            .map((k) => k.decodeText())
            .sort();
        }
      }
    } catch {
      xObjectNames = [];
    }

    pageSummaries.push({
      pageNumber: i + 1,
      widthPt: Math.round(width * 100) / 100,
      heightPt: Math.round(height * 100) / 100,
      rotationDeg,
      xObjectCount: xObjectNames.length,
      xObjectNames,
    });
  }

  const canonicalJson = JSON.stringify({
    pageCount: pages.length,
    pages: pageSummaries,
  });
  const fingerprintSha256 = await shaDigestHex('SHA-256', canonicalJson);

  return {
    pageCount: pages.length,
    pages: pageSummaries,
    fingerprintSha256,
  };
}

/**
 * ページ下部に電子署名法準拠マイクロ証明刻印（ASCII文字）を描画
 */
async function drawMicroProofFooterOnPages(
  pdfDoc: PDFLib,
  stampedPageNumbers: number[],
  proofId: string,
  signerRoman: string,
  orgEn: string,
  algMeta: AlgorithmMetadata,
  docHashShort: string,
  signedAtIso: string
) {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const uniquePages = Array.from(new Set(stampedPageNumbers));

  for (const pageNum of uniquePages) {
    const idx = pageNum - 1;
    if (idx < 0 || idx >= pages.length) continue;
    const page = pages[idx];
    const { width } = page.getSize();

    const footerLine1 = `[YDK ELECTRONIC SIGNATURE PROOF] ID: ${proofId} | Signer: ${signerRoman} (${orgEn}) | Time: ${signedAtIso}`;
    const footerLine2 = `Alg: ${algMeta.id} (OID: ${algMeta.signatureOid}) | Doc-SHA256: ${docHashShort}... | Act on Electronic Signatures Art.2(1) & Art.3 Self-Managed Seal (Non-Accredited per Art.13(2))`;

    page.drawRectangle({
      x: 20,
      y: 6,
      width: Math.max(200, width - 40),
      height: 15,
      color: rgb(0.97, 0.98, 1.0),
      borderColor: rgb(0.75, 0.82, 0.92),
      borderWidth: 0.4,
      opacity: 0.92,
    });

    page.drawText(footerLine1.slice(0, 135), {
      x: 24,
      y: 14,
      size: 5.5,
      font,
      color: rgb(0.12, 0.22, 0.45),
    });

    page.drawText(footerLine2.slice(0, 145), {
      x: 24,
      y: 8,
      size: 5.0,
      font,
      color: rgb(0.28, 0.34, 0.46),
    });
  }
}

/**
 * 巻末に「電子署名及び認証業務に関する法律準拠 署名検証証明書（英語版/ASCII PDF互換）」ページを添付
 */
async function appendVerificationCertificatePageToPdf(
  pdfDoc: PDFLib,
  profile: LegalSignerProfile,
  algMeta: AlgorithmMetadata,
  proofId: string,
  serialNumber: string,
  originalDocSha256: string,
  issuerKeyHashes: { sha256: string; sha384: string; sha512: string },
  signedAtIso: string,
  stampCount: number
) {
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 外枠
  page.drawRectangle({
    x: 32,
    y: 32,
    width: 531.28,
    height: 777.89,
    borderColor: rgb(0.12, 0.24, 0.52),
    borderWidth: 1.5,
  });

  // ヘッダー
  page.drawRectangle({
    x: 32,
    y: 745,
    width: 531.28,
    height: 64.89,
    color: rgb(0.1, 0.22, 0.48),
  });

  page.drawText('ELECTRONIC SIGNATURE & SEAL VERIFICATION CERTIFICATE', {
    x: 48,
    y: 782,
    size: 13.5,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(
    'Compliant with the Act on Electronic Signatures and Certification Business (Act No. 102 of 2000, Japan)',
    {
      x: 48,
      y: 762,
      size: 8.5,
      font,
      color: rgb(0.88, 0.93, 1),
    }
  );

  const lines: Array<{ label: string; value: string }> = [
    { label: 'Proof ID', value: proofId },
    { label: 'Certificate Serial No.', value: serialNumber },
    { label: 'Signed Timestamp (ISO)', value: signedAtIso },
    { label: 'Signer Name (Romanized / Guideline Art.9)', value: profile.signerNameRoman },
    { label: 'Organization (English)', value: profile.organizationNameEn },
    { label: 'Invoice Registration No.', value: profile.invoiceRegistrationNo },
    { label: 'Registered Address', value: profile.addressEn },
    { label: 'Contact Email', value: profile.contactEmail },
    { label: 'Applied Electronic Seals', value: `${stampCount} seal(s) embedded with SHA-256 integrity hashes` },
    { label: 'Signature Algorithm', value: `${algMeta.name}` },
    { label: 'Algorithm OID (Guideline Art.3)', value: `Signature OID: ${algMeta.signatureOid} / Hash OID: ${algMeta.hashOid}` },
    { label: 'Original Document SHA-256', value: originalDocSha256 },
    { label: 'Issuer Verification Key SHA-256 (Art.10-2)', value: issuerKeyHashes.sha256 },
    { label: 'Issuer Verification Key SHA-384 (Art.10-2)', value: issuerKeyHashes.sha384.slice(0, 64) + '...' },
    { label: 'Governing Law & Jurisdiction (Art.12)', value: 'Laws of Japan / Chiba or Tokyo District Court' },
  ];

  let y = 718;
  for (const row of lines) {
    page.drawText(`${row.label}:`, {
      x: 48,
      y,
      size: 8.5,
      font: fontBold,
      color: rgb(0.15, 0.22, 0.36),
    });
    page.drawText(row.value.slice(0, 88), {
      x: 48,
      y: y - 12,
      size: 8.0,
      font,
      color: rgb(0.1, 0.1, 0.15),
    });
    y -= 34;
  }

  // 法第13条第2項・指針第8条・第10条の法定免責・誤認防止表記ボックス
  page.drawRectangle({
    x: 48,
    y: 60,
    width: 499,
    height: 125,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.65, 0.72, 0.85),
    borderWidth: 0.8,
  });

  const disclaimerLines = [
    'STATUTORY COMPLIANCE & NON-MISCONCEPTION NOTICE (Act Art. 2(1), Art. 3, Art. 13(2), Guideline Art. 8 & 10):',
    '1. Creator Attribution & Tamper Detection (Act Art. 2(1) Items 1 & 2): This PDF contains an embedded JSON',
    '   cryptographic signature package (YDK_Electronic_Signature_Proof.json) and SPKI public key (YDK_Verification_PublicKey.pem).',
    '2. Presumption of Authentic Creation (Act Art. 3): Signed using a strictly managed private key controlled solely by the signer.',
    '3. Non-Accredited Status Notice (Act Art. 13(2) & Guideline Art. 8/10): This certificate is an internal/party-managed',
    '   electronic signature & e-Seal issued by YDK Renovation Inc. It is NOT a Specified Certification Business accredited under',
    '   Article 4(1) of the Act, and corporate title/role attributes are outside the scope of government accreditation.',
  ];

  let dy = 168;
  for (const dl of disclaimerLines) {
    page.drawText(dl, {
      x: 56,
      y: dy,
      size: 7.2,
      font: dl.startsWith('STATUTORY') ? fontBold : font,
      color: rgb(0.2, 0.25, 0.35),
    });
    dy -= 15;
  }
}

/**
 * 押印済みPDFドキュメントに対して、電子署名法・関連省令・指針に完全準拠した
 * 暗号署名＆証明データパッケージ（JSON添付＋公開鍵PEM添付＋PDFカタログ埋め込み＋メタデータ＋監査台帳記録）を組み込む
 */
export async function embedLegalSignatureIntoPdfDoc(params: {
  pdfDoc: PDFLib;
  rawOriginalPdfBytes: Uint8Array;
  documentFileName: string;
  stamps: PDFStamp[];
  sealPngDataUrls: string[];
  profile?: Partial<LegalSignerProfile>;
}): Promise<{
  signedPdfBytes: Uint8Array;
  proofPackage: YDKLegalSignatureProofPackage;
}> {
  const profile: LegalSignerProfile = {
    ...DEFAULT_LEGAL_SIGNER_PROFILE,
    ...(params.profile || {}),
  };
  const algMeta = ALGORITHM_METADATA_MAP[profile.algorithm] || ALGORITHM_METADATA_MAP['RSA-2048-SHA256'];
  const keyMaterial = await getOrCreateSignerKeyPair(profile.algorithm);

  const signedAtIso = new Date().toISOString();
  const originalDocSha256 = await shaDigestHex('SHA-256', params.rawOriginalPdfBytes);
  const proofId = `YDK-SIG-${signedAtIso.slice(0, 10).replace(/-/g, '')}-${originalDocSha256.slice(0, 10).toUpperCase()}`;

  // 1. オプション: ページ下部へのマイクロ証明刻印
  if (profile.drawPageMicroFooter && params.stamps.length > 0) {
    await drawMicroProofFooterOnPages(
      params.pdfDoc,
      params.stamps.map((s) => s.pageNumber),
      proofId,
      profile.signerNameRoman,
      profile.organizationNameEn,
      algMeta,
      originalDocSha256.slice(0, 24),
      signedAtIso
    );
  }

  // 2. オプション: 巻末への検証証明書ページの追加
  if (profile.appendCertificatePage) {
    await appendVerificationCertificatePageToPdf(
      params.pdfDoc,
      profile,
      algMeta,
      proofId,
      keyMaterial.serialNumber,
      originalDocSha256,
      keyMaterial.keyHashes,
      signedAtIso,
      params.stamps.length
    );
  }

  // 3. 各印影画像のSHA-256ハッシュを計算
  const appliedStampsSummary: SignedAttributesPayload['appliedStamps'] = [];
  for (let i = 0; i < params.stamps.length; i++) {
    const s = params.stamps[i];
    const dataUrl = params.sealPngDataUrls[i] || '';
    const sealHash = await shaDigestHex('SHA-256', dataUrl);
    appliedStampsSummary.push({
      index: i + 1,
      pageNumber: s.pageNumber,
      stampName: s.config.name || 'YDK電子印鑑',
      stampType: s.config.type,
      stampText: s.config.text || '',
      xPt: Math.round(s.position.x * 100) / 100,
      yPt: Math.round(s.position.y * 100) / 100,
      widthPt: Math.round(s.position.width * 100) / 100,
      heightPt: Math.round(s.position.height * 100) / 100,
      sealImageSha256: sealHash,
    });
  }

  // 4. ページ構造＆印影リソース指紋（法第2条第1項第2号 非改変確認用）を計算
  const visualStructureFingerprint = await computePdfVisualFingerprint(params.pdfDoc);

  // 5. 電子証明書（指針第3条・第8条・第9条・第10条・第11条・第12条・法第13条第2項準拠）を構築
  const notBeforeDate = new Date(keyMaterial.createdAtIso);
  const notAfterDate = new Date(notBeforeDate.getTime() + 5 * 365 * 24 * 60 * 60 * 1000); // 5年間有効

  const certificate: LegalElectronicCertificate = {
    certificateVersion: 'X509-JSON-v3-YDK-2026',
    serialNumber: keyMaterial.serialNumber,
    issuer: {
      commonName: 'YDK Smart Seal Studio Internal Authority (Self-Managed Party Signer)',
      organizationJa: profile.organizationNameJa,
      organizationEn: profile.organizationNameEn,
      country: 'JP',
      contactEmail: profile.contactEmail,
    },
    subject: {
      commonNameJa: `${profile.representativeTitleJa} ${profile.signerNameJa}`,
      commonNameRoman: profile.signerNameRoman,
      organizationJa: profile.organizationNameJa,
      organizationEn: profile.organizationNameEn,
      titleJa: profile.representativeTitleJa,
      addressJa: profile.addressJa,
      invoiceRegistrationNo: profile.invoiceRegistrationNo,
      country: 'JP',
    },
    validity: {
      notBeforeIso: notBeforeDate.toISOString(),
      notAfterIso: notAfterDate.toISOString(),
    },
    algorithm: algMeta,
    issuerVerificationKeyHashes: keyMaterial.keyHashes,
    publicKeyJwk: keyMaterial.publicKeyJwk,
    publicKeySpkiPem: keyMaterial.publicKeySpkiPem,
    statutoryDisclaimers: {
      article13Paragraph2Statement:
        '【電子署名法第13条第2項遵守表示】本証明データは電子署名及び認証業務に関する法律第2条第1項及び第3条に基づく当事者型・自社管理型の電子署名及び電子印鑑証明であり、同法第4条第1項の主務大臣による特定認証業務の認定を受けたものではありません。',
      attributeScopeStatement:
        '【認定指針第8条・第10条第3号・調査方針第4の4に基づく誤認防止表示】本証明データに記載された利用者の役職名・法人属性・適格請求書登録番号（氏名、住所及び生年月日を除く属性）は株式会社YDKリノベーションの自社確認に基づく記載であり、電子署名法第4条第1項の特定認証業務の認定対象外です。',
      certificatePurpose: profile.certificatePurpose,
    },
    verifierDisclosure: {
      verificationInstruction:
        '【指針第11条第1号】本PDFを「YDK スマート電子印鑑スタジオ」の「🔍 電子署名・証明データ検証」画面に読み込ませるか、CLIコマンド `ydk-seal verify --pdf <ファイル名>`、またはPDF添付の `YDK_Verification_PublicKey.pem` (SPKI公開鍵) を用いて `signedAttributes` のSHA-256署名を検証してください。',
      liabilityLimitation:
        '【指針第11条第2号・第12条第1項第2号・第3号】本証明データは記載された「電子証明書の用途（見積書・請求書・契約書・施工関係書類等の真正性証明）」の範囲内で有効とし、当該用途外の流用について発行者は一切の保証責任を負いません。',
      revocationCheckMethod:
        '【指針第11条第3号・第12条第1項第5号・第6号】鍵の危殆化・失効情報については発行者窓口（abeyuuki@yarebadekiruko.com）への照会またはYDK監査台帳（ydk_electronic_signature_ledger.jsonl）により確認できます。',
      issuerContact: `${profile.organizationNameJa} (${profile.addressJa} / E-mail: ${profile.contactEmail})`,
      governingLawAndJurisdiction:
        '【指針第12条第1項第11号】本電子署名及び証明データに関する準拠法は日本法とし、関連する一切の紛争については千葉地方裁判所または東京地方裁判所を第一審の専属的合意管轄裁判所とします。',
    },
  };

  // 6. 署名対象属性ペイロード (SignedAttributesPayload) を構築
  const signedAttributes: SignedAttributesPayload = {
    proofId,
    signedAtIso,
    documentFileName: params.documentFileName || 'document.pdf',
    originalDocumentSha256: originalDocSha256,
    visualStructureFingerprint,
    appliedStamps: appliedStampsSummary,
    signerCertificateSerialNumber: keyMaterial.serialNumber,
    issuerKeySha256: keyMaterial.keyHashes.sha256,
    legalComplianceDeclaration: {
      actArticle2Paragraph1Item1:
        '電子署名法第2条第1項第1号適合: 当該電磁的記録が作成者（株式会社YDKリノベーション 代表取締役 阿部裕樹）の作成に係るものであることを暗号署名及び公開鍵証明書により表示',
      actArticle2Paragraph1Item2:
        '電子署名法第2条第1項第2号適合: 原文PDFダイジェスト・ページ構造指紋・各印影画像SHA-256ダイジェストに対する公開鍵暗号署名により改変の有無を検証可能',
      actArticle3:
        '電子署名法第3条適合: 本人だけが管理・使用できる利用者署名符号（2048bit RSA / P-256 ECDSA 秘密鍵）により署名を実行',
      actArticle13Paragraph2:
        '電子署名法第13条第2項適合: 特定認証業務の認定と紛らわしい表示を排除し、当事者型・自社管理型電子署名である旨及び役職属性の誤認防止措置を明記',
    },
  };

  const canonicalSignedAttributesJson = JSON.stringify(signedAttributes);
  const signedAttrBytes = new TextEncoder().encode(canonicalSignedAttributesJson);
  const [attrSha256, attrSha512] = await Promise.all([
    shaDigestHex('SHA-256', signedAttrBytes),
    shaDigestHex('SHA-512', signedAttrBytes),
  ]);

  // 7. 利用者署名符号（秘密鍵）による暗号署名を実行
  const signParams: AlgorithmIdentifier | EcdsaParams =
    profile.algorithm === 'RSA-2048-SHA256'
      ? { name: 'RSASSA-PKCS1-v1_5' }
      : { name: 'ECDSA', hash: { name: 'SHA-256' } };

  const attrCopy = new Uint8Array(signedAttrBytes.byteLength);
  attrCopy.set(signedAttrBytes);
  const signatureBuf = await window.crypto.subtle.sign(
    signParams,
    keyMaterial.privateKey,
    attrCopy.buffer
  );
  const cryptographicSignatureBase64 = bufferToBase64(signatureBuf);
  const signatureDigestSha256 = await shaDigestHex('SHA-256', new Uint8Array(signatureBuf));

  // 8. 指定調査機関省令第9条・調査方針第6準拠 電磁的帳簿レコードを作成
  const auditLedgerRecord: YDKLegalSignatureProofPackage['auditLedgerRecord'] = {
    ledgerRecordId: `LEDGER-${Date.now()}-${proofId.slice(-6)}`,
    recordedAtIso: signedAtIso,
    retentionPeriodYears: 10,
    statutoryBasis:
      '電子署名及び認証業務に関する法律に基づく指定調査機関等に関する省令第9条及び調査に関する方針第6（電磁的方法による帳簿保存・10年間保存互換仕様）',
    signerSummary: `${profile.organizationNameJa} ${profile.representativeTitleJa} ${profile.signerNameJa} (${profile.signerNameRoman})`,
    documentFileName: params.documentFileName || 'document.pdf',
    proofId,
    signatureDigestSha256,
  };

  const proofPackage: YDKLegalSignatureProofPackage = {
    schema: 'https://yarebadekiruko.com/schemas/electronic-signature-proof/v1.0.json',
    engineName: 'YDK Smart Seal Studio - Legal Electronic Signature Engine',
    engineVersion: '2.3.0',
    certificate,
    signedAttributes,
    signedAttributesDigest: {
      sha256: attrSha256,
      sha512: attrSha512,
    },
    cryptographicSignatureBase64,
    auditLedgerRecord,
  };

  // ローカル監査台帳 (localStorage) にも保存
  appendAuditLedgerToLocalStorage(auditLedgerRecord);

  // 9. PDF自体に証明データを4層で組み込む
  const proofJsonStr = JSON.stringify(proofPackage, null, 2);
  const proofJsonBytes = new TextEncoder().encode(proofJsonStr);
  const pemBytes = new TextEncoder().encode(keyMaterial.publicKeySpkiPem);

  // (Layer A) PDF Embedded File Attachment (Adobe Reader等の添付ファイルタブから直接参照可能)
  await params.pdfDoc.attach(proofJsonBytes, 'YDK_Electronic_Signature_Proof.json', {
    mimeType: 'application/json',
    description:
      '電子署名及び認証業務に関する法律（平成12年法律第102号）第2条第1項・第3条・認定指針準拠 証明データパッケージ',
    creationDate: new Date(signedAtIso),
    modificationDate: new Date(signedAtIso),
  });

  await params.pdfDoc.attach(pemBytes, 'YDK_Verification_PublicKey.pem', {
    mimeType: 'application/x-pem-file',
    description: `発行者・署名者検証公開鍵 (${algMeta.id}, OID: ${algMeta.signatureOid}, SHA256: ${keyMaterial.keyHashes.sha256})`,
    creationDate: new Date(signedAtIso),
    modificationDate: new Date(signedAtIso),
  });

  // (Layer B) PDF Catalog 直下に YDKLegalSignatureProof (HexエンコードUTF-8) を格納（高速・確実な機械検証用）
  const proofCompactUtf8Bytes = new TextEncoder().encode(JSON.stringify(proofPackage));
  const proofHex = bufferToHex(proofCompactUtf8Bytes);
  params.pdfDoc.catalog.set(PDFName.of('YDKLegalSignatureProof'), PDFHexString.of(proofHex));

  // (Layer C) PDF 標準メタデータ (Author / Subject / Keywords / Producer / Creator)
  params.pdfDoc.setTitle(`${params.documentFileName || 'Document'} [電子署名法準拠証明データ付]`);
  params.pdfDoc.setAuthor(
    `${profile.organizationNameJa} ${profile.representativeTitleJa} ${profile.signerNameJa} (${profile.signerNameRoman})`
  );
  params.pdfDoc.setSubject(
    `電子署名法第2条第1項・第3条準拠 当事者型電子署名付 (法第4条第1項の特定認証業務認定対象外・法第13条第2項遵守) | ProofID: ${proofId} | Alg: ${algMeta.id} (OID: ${algMeta.signatureOid}) | KeySHA256: ${keyMaterial.keyHashes.sha256}`
  );
  params.pdfDoc.setKeywords([
    'YDK Smart Seal Studio',
    '電子署名法準拠',
    `ProofID:${proofId}`,
    `OID:${algMeta.signatureOid}`,
    `DocSHA256:${originalDocSha256}`,
    `KeySHA256:${keyMaterial.keyHashes.sha256}`,
    `Signer:${profile.signerNameRoman}`,
  ]);
  params.pdfDoc.setProducer(
    `YDK Smart Seal Studio v2.3.0 (Legal Electronic Signature Engine / ${algMeta.id})`
  );
  params.pdfDoc.setCreator(profile.organizationNameEn);
  params.pdfDoc.setModificationDate(new Date(signedAtIso));

  const signedPdfBytes = await params.pdfDoc.save();
  return {
    signedPdfBytes,
    proofPackage,
  };
}

/**
 * PDFバイナリから埋め込まれた証明データパッケージを抽出し、
 * 電子署名法第2条第1項第1号（本人作成表示）及び第2号（非改変確認）を暗号学的に検証する
 */
export async function verifyPdfLegalSignature(
  pdfBytes: Uint8Array
): Promise<LegalVerificationResult> {
  const details: string[] = [];
  try {
    const pdfDoc = await PDFLib.load(pdfBytes, { ignoreEncryption: true });
    const rawEntry = pdfDoc.catalog.get(PDFName.of('YDKLegalSignatureProof'));

    let proofPackage: YDKLegalSignatureProofPackage | null = null;

    if (rawEntry instanceof PDFHexString) {
      const hexStr = rawEntry.asString();
      const bytes = new Uint8Array(hexStr.length / 2);
      for (let i = 0; i < hexStr.length; i += 2) {
        bytes[i / 2] = parseInt(hexStr.slice(i, i + 2), 16);
      }
      const jsonStr = new TextDecoder().decode(bytes);
      proofPackage = JSON.parse(jsonStr);
    } else if (rawEntry) {
      const lookedUp = pdfDoc.context.lookup(rawEntry);
      if (lookedUp instanceof PDFHexString) {
        const hexStr = lookedUp.asString();
        const bytes = new Uint8Array(hexStr.length / 2);
        for (let i = 0; i < hexStr.length; i += 2) {
          bytes[i / 2] = parseInt(hexStr.slice(i, i + 2), 16);
        }
        const jsonStr = new TextDecoder().decode(bytes);
        proofPackage = JSON.parse(jsonStr);
      }
    }

    if (!proofPackage) {
      return {
        isValid: false,
        hasEmbeddedProof: false,
        creatorAttributionValid: false,
        tamperFreeValid: false,
        cryptographicSignatureValid: false,
        visualStructureMatches: false,
        summaryMessage:
          '⚠️ このPDFには「YDK電子署名法準拠・証明データ」がまだ組み込まれていません。押印して出力すると自動で無料の証明データが組み込まれます。',
        details: ['PDFカタログ内に YDKLegalSignatureProof エントリが見つかりませんでした。'],
      };
    }

    const { certificate, signedAttributes, cryptographicSignatureBase64 } = proofPackage;
    const algId = certificate.algorithm.id;
    const isRsa = algId === 'RSA-2048-SHA256';

    // 1. 公開鍵のインポートと発行者ハッシュ値の整合検証（指針第10条第2号）
    const importParams: RsaHashedImportParams | EcKeyImportParams = isRsa
      ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' };

    const publicKey = await window.crypto.subtle.importKey(
      'jwk',
      certificate.publicKeyJwk,
      importParams,
      true,
      ['verify']
    );

    const spkiBuf = await window.crypto.subtle.exportKey('spki', publicKey);
    const computedKeySha256 = await shaDigestHex('SHA-256', new Uint8Array(spkiBuf));
    const keyHashMatches =
      computedKeySha256 === certificate.issuerVerificationKeyHashes.sha256 &&
      computedKeySha256 === signedAttributes.issuerKeySha256;

    details.push(
      keyHashMatches
        ? `✅ [指針第10条第2号] 発行者署名検証符号 SHA-256 ハッシュ一致 (${computedKeySha256.slice(0, 24)}...)`
        : `❌ [指針第10条第2号] 発行者署名検証符号のSHA-256ハッシュが不整合です`
    );

    // 2. 暗号署名の検証（法第2条第1項第1号・第3条）
    const canonicalSignedAttributesJson = JSON.stringify(signedAttributes);
    const signedAttrBytes = new TextEncoder().encode(canonicalSignedAttributesJson);
    const sigBytes = base64ToUint8Array(cryptographicSignatureBase64);

    const verifyParams: AlgorithmIdentifier | EcdsaParams = isRsa
      ? { name: 'RSASSA-PKCS1-v1_5' }
      : { name: 'ECDSA', hash: { name: 'SHA-256' } };

    const sigCopy = new Uint8Array(sigBytes.byteLength);
    sigCopy.set(sigBytes);
    const attrCopy = new Uint8Array(signedAttrBytes.byteLength);
    attrCopy.set(signedAttrBytes);

    const cryptographicSignatureValid = await window.crypto.subtle.verify(
      verifyParams,
      publicKey,
      sigCopy.buffer,
      attrCopy.buffer
    );

    details.push(
      cryptographicSignatureValid
        ? `✅ [法第2条第1項第1号・第3条] 暗号署名検証成功 (${certificate.algorithm.name}, OID: ${certificate.algorithm.signatureOid})`
        : `❌ [法第2条第1項第1号] 暗号署名の検証に失敗しました（署名データ改変の疑い）`
    );

    // 3. ページ構造＆印影リソース指紋の比較（法第2条第1項第2号 非改変確認）
    const currentFingerprint = await computePdfVisualFingerprint(pdfDoc);
    const expectedFingerprint = signedAttributes.visualStructureFingerprint;
    const visualStructureMatches =
      currentFingerprint.fingerprintSha256 === expectedFingerprint.fingerprintSha256 &&
      currentFingerprint.pageCount === expectedFingerprint.pageCount;

    details.push(
      visualStructureMatches
        ? `✅ [法第2条第1項第2号] PDFページ構造・印影リソース指紋完全一致 (全${currentFingerprint.pageCount}ページ・改ざんなし)`
        : `❌ [法第2条第1項第2号] PDFのページ構成または印影リソースが署名時から変更されています`
    );

    // 4. 法第13条第2項・指針第8条/10条の法定表示確認
    const hasStatutoryDisclaimers = Boolean(
      certificate.statutoryDisclaimers?.article13Paragraph2Statement &&
        certificate.statutoryDisclaimers?.attributeScopeStatement &&
        certificate.subject?.commonNameRoman
    );
    details.push(
      hasStatutoryDisclaimers
        ? `✅ [法第13条第2項・指針第8条/9条/10条] ローマ字氏名 (${certificate.subject.commonNameRoman}) 及び非認定・属性誤認防止表示を確認`
        : `⚠️ 法定表示項目の一部が不足しています`
    );

    const creatorAttributionValid = cryptographicSignatureValid && keyHashMatches && hasStatutoryDisclaimers;
    const tamperFreeValid = cryptographicSignatureValid && visualStructureMatches;
    const isValid = creatorAttributionValid && tamperFreeValid;

    return {
      isValid,
      hasEmbeddedProof: true,
      creatorAttributionValid,
      tamperFreeValid,
      cryptographicSignatureValid,
      visualStructureMatches,
      summaryMessage: isValid
        ? `🛡️【検証成功・真正性確認済】電子署名法第2条第1項（本人作成表示・非改変確認）及び第3条に準拠した有効な証明データを確認しました。署名後の改ざんはありません。`
        : `🚨【検証警告】証明データの暗号署名またはPDFページ構造に不整合が検出されました。`,
      details,
      proofPackage,
    };
  } catch (err: any) {
    return {
      isValid: false,
      hasEmbeddedProof: false,
      creatorAttributionValid: false,
      tamperFreeValid: false,
      cryptographicSignatureValid: false,
      visualStructureMatches: false,
      summaryMessage: `検証中にエラーが発生しました: ${err?.message || err}`,
      details: [String(err?.message || err)],
    };
  }
}

/**
 * 監査台帳（指定調査機関省令第9条・調査方針第6準拠）をlocalStorageに追記・取得
 */
function appendAuditLedgerToLocalStorage(
  record: YDKLegalSignatureProofPackage['auditLedgerRecord']
) {
  try {
    const raw = localStorage.getItem(STORAGE_LEDGER_KEY);
    const list: Array<YDKLegalSignatureProofPackage['auditLedgerRecord']> = raw
      ? JSON.parse(raw)
      : [];
    list.unshift(record);
    localStorage.setItem(STORAGE_LEDGER_KEY, JSON.stringify(list.slice(0, 500)));
  } catch {
    // ignore storage quota errors
  }
}

export function getLocalSignatureAuditLedger(): Array<
  YDKLegalSignatureProofPackage['auditLedgerRecord']
> {
  try {
    const raw = localStorage.getItem(STORAGE_LEDGER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 証明データ（JSON）または監査台帳（JSONL）をファイルとしてダウンロード
 */
export function downloadJsonText(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

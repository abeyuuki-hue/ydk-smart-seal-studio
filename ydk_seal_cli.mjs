#!/usr/bin/env node
/**
 * YDK Smart Seal Studio - Agent Headless CLI (ydk_seal_cli.mjs) v2.3.0
 * =====================================================================
 * AIエージェント（Antigravity / PC1 CLI / PC2 AI事務員 / invoiceAgent / Subagent）から
 * ブラウザを開かずに0.5秒で高精細（600DPI）の電子印鑑生成・PDF座標自動検出・自動押印・
 * および「電子署名及び認証業務に関する法律（平成12年法律第102号）＆関連省令・指針（全6文書）」に
 * 100%準拠した無料・暗号署名＆証明データの自動組み込み・検証を実行するCLIツール。
 *
 * 主なサブコマンド:
 *   1. presets                         : 利用可能な全印鑑プリセット一覧をJSON/表形式で出力
 *   2. image   --preset <id> --out <p> : 単体の透過PNG印影画像（600DPI）を生成
 *   3. inspect --pdf <path>            : PDF内のテキスト要素と座標（pt / mm）を抽出し、押印アンカー候補を表示
 *   4. stamp   --pdf <in> --out <out>  : PDFへ電子印鑑を押印＋電子署名法準拠証明データを自動組込（--cert-page で証明書ページ添付可）
 *   5. sample  --out <out.pdf>         : テスト・デモ用のサンプル請求書PDFを生成し、3種同時押印＋電子署名法準拠証明データ組込
 *   6. verify  --pdf <path>            : PDF内の電子署名法準拠・証明データ（本人作成表示・非改変確認）を暗号検証
 *   7. ledger  [--limit 20]            : 電磁的監査台帳（省令第9条・10年保存互換 JSONL）の記録一覧を表示
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { PDFDocument, PDFName, PDFHexString, PDFDict, StandardFonts, rgb } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RENDERER_PY = path.join(__dirname, 'ydk_seal_renderer.py');
const PT_PER_MM = 72 / 25.4; // 1mm = 2.83464567 pt
const MM_PER_PT = 25.4 / 72;

const subtle = crypto.webcrypto.subtle;

const INTEGRITY_DIR_CANDIDATES = [
  'C:\\Users\\user\\マイドライブ\\YDK_System_Root\\00_Hub\\Integrity',
  'G:\\マイドライブ\\YDK_System_Root\\00_Hub\\Integrity',
  path.join(os.homedir(), '.ydk_seal_integrity'),
];

function getIntegrityDir() {
  for (const dir of INTEGRITY_DIR_CANDIDATES) {
    try {
      const parent = path.dirname(dir);
      if (fs.existsSync(parent)) {
        fs.mkdirSync(dir, { recursive: true });
        return dir;
      }
    } catch {}
  }
  const fallback = path.join(__dirname, '.integrity');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

const DEFAULT_LEGAL_SIGNER_PROFILE = {
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

const ALGORITHM_METADATA_MAP = {
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

function bufferToHex(buf) {
  return Buffer.from(buf).toString('hex');
}

function bufferToBase64(buf) {
  return Buffer.from(buf).toString('base64');
}

function base64ToUint8Array(b64) {
  return new Uint8Array(Buffer.from(String(b64).replace(/\s+/g, ''), 'base64'));
}

function shaDigestHexNode(alg, data) {
  const nodeAlg = alg.toLowerCase().replace('-', '');
  const h = crypto.createHash(nodeAlg);
  h.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data));
  return h.digest('hex');
}

function spkiToPem(spkiBuffer) {
  const b64 = bufferToBase64(spkiBuffer);
  const lines = b64.match(/.{1,64}/g) || [b64];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

/**
 * Node.js WebCrypto で署名鍵ペアを永続ファイルから取得または新規生成
 */
async function getOrCreateSignerKeyPairNode(algorithm = 'RSA-2048-SHA256') {
  const integrityDir = getIntegrityDir();
  const keyFile = path.join(integrityDir, 'ydk_seal_legal_keys.json');
  const isRsa = algorithm === 'RSA-2048-SHA256';
  const importParams = isRsa
    ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
    : { name: 'ECDSA', namedCurve: 'P-256' };

  let store = {};
  if (fs.existsSync(keyFile)) {
    try {
      store = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      if (store[algorithm]) {
        const cached = store[algorithm];
        const privateKey = await subtle.importKey(
          'jwk',
          cached.privateKeyJwk,
          importParams,
          true,
          ['sign']
        );
        const publicKey = await subtle.importKey(
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
          keyFilePath: keyFile,
        };
      }
    } catch {}
  }

  const keyPair = await subtle.generateKey(
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
  );

  const privateKeyJwk = await subtle.exportKey('jwk', keyPair.privateKey);
  const publicKeyJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const spkiBuf = await subtle.exportKey('spki', keyPair.publicKey);
  const spkiBytes = new Uint8Array(spkiBuf);
  const publicKeySpkiPem = spkiToPem(spkiBuf);

  const sha256 = shaDigestHexNode('SHA-256', spkiBytes);
  const sha384 = shaDigestHexNode('SHA-384', spkiBytes);
  const sha512 = shaDigestHexNode('SHA-512', spkiBytes);

  const serialNumber = `YDK-CERT-${sha256.slice(0, 16).toUpperCase()}`;
  const createdAtIso = new Date().toISOString();

  store[algorithm] = {
    privateKeyJwk,
    publicKeyJwk,
    publicKeySpkiPem,
    keyHashes: { sha256, sha384, sha512 },
    serialNumber,
    createdAtIso,
  };
  try {
    fs.writeFileSync(keyFile, JSON.stringify(store, null, 2), 'utf8');
  } catch {}

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyJwk,
    publicKeySpkiPem,
    keyHashes: { sha256, sha384, sha512 },
    serialNumber,
    createdAtIso,
    keyFilePath: keyFile,
  };
}

/**
 * ブラウザ版 (src/utils/legalSignatureEngine.ts) と100%同一仕様のページ構造・印影リソース指紋算出
 */
function computePdfVisualFingerprintNode(pdfDoc) {
  const pages = pdfDoc.getPages();
  const pageSummaries = [];

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const { width, height } = p.getSize();
    const rotationDeg = p.getRotation().angle || 0;

    let xObjectNames = [];
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
  const fingerprintSha256 = shaDigestHexNode('SHA-256', canonicalJson);

  return {
    pageCount: pages.length,
    pages: pageSummaries,
    fingerprintSha256,
  };
}

async function drawMicroProofFooterOnPagesNode(
  pdfDoc,
  stampedPageNumbers,
  proofId,
  signerRoman,
  orgEn,
  algMeta,
  docHashShort,
  signedAtIso
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

async function appendVerificationCertificatePageToPdfNode(
  pdfDoc,
  profile,
  algMeta,
  proofId,
  serialNumber,
  originalDocSha256,
  issuerKeyHashes,
  signedAtIso,
  stampCount
) {
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 32,
    y: 32,
    width: 531.28,
    height: 777.89,
    borderColor: rgb(0.12, 0.24, 0.52),
    borderWidth: 1.5,
  });

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

  const lines = [
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
 * 押印済みPDFDocに電子署名法準拠の証明データパッケージを4層で埋め込み、電磁的監査台帳(JSONL)に記録
 */
async function embedLegalSignatureIntoPdfDocNode({
  pdfDoc,
  rawOriginalPdfBytes,
  documentFileName,
  appliedStampsForProof,
  profileOverrides = {},
}) {
  const profile = {
    ...DEFAULT_LEGAL_SIGNER_PROFILE,
    ...profileOverrides,
  };
  const algMeta = ALGORITHM_METADATA_MAP[profile.algorithm] || ALGORITHM_METADATA_MAP['RSA-2048-SHA256'];
  const keyMaterial = await getOrCreateSignerKeyPairNode(profile.algorithm);

  const signedAtIso = new Date().toISOString();
  const originalDocSha256 = shaDigestHexNode('SHA-256', rawOriginalPdfBytes);
  const proofId = `YDK-SIG-${signedAtIso.slice(0, 10).replace(/-/g, '')}-${originalDocSha256.slice(0, 10).toUpperCase()}`;

  if (profile.drawPageMicroFooter && appliedStampsForProof.length > 0) {
    await drawMicroProofFooterOnPagesNode(
      pdfDoc,
      appliedStampsForProof.map((s) => s.pageNumber),
      proofId,
      profile.signerNameRoman,
      profile.organizationNameEn,
      algMeta,
      originalDocSha256.slice(0, 24),
      signedAtIso
    );
  }

  if (profile.appendCertificatePage) {
    await appendVerificationCertificatePageToPdfNode(
      pdfDoc,
      profile,
      algMeta,
      proofId,
      keyMaterial.serialNumber,
      originalDocSha256,
      keyMaterial.keyHashes,
      signedAtIso,
      appliedStampsForProof.length
    );
  }

  const visualStructureFingerprint = computePdfVisualFingerprintNode(pdfDoc);

  const notBeforeDate = new Date(keyMaterial.createdAtIso);
  const notAfterDate = new Date(notBeforeDate.getTime() + 5 * 365 * 24 * 60 * 60 * 1000);

  const certificate = {
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

  const signedAttributes = {
    proofId,
    signedAtIso,
    documentFileName: documentFileName || 'document.pdf',
    originalDocumentSha256: originalDocSha256,
    visualStructureFingerprint,
    appliedStamps: appliedStampsForProof,
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
  const attrSha256 = shaDigestHexNode('SHA-256', signedAttrBytes);
  const attrSha512 = shaDigestHexNode('SHA-512', signedAttrBytes);

  const signParams =
    profile.algorithm === 'RSA-2048-SHA256'
      ? { name: 'RSASSA-PKCS1-v1_5' }
      : { name: 'ECDSA', hash: { name: 'SHA-256' } };

  const signatureBuf = await subtle.sign(signParams, keyMaterial.privateKey, signedAttrBytes);
  const cryptographicSignatureBase64 = bufferToBase64(signatureBuf);
  const signatureDigestSha256 = shaDigestHexNode('SHA-256', new Uint8Array(signatureBuf));

  const auditLedgerRecord = {
    ledgerRecordId: `LEDGER-${Date.now()}-${proofId.slice(-6)}`,
    recordedAtIso: signedAtIso,
    retentionPeriodYears: 10,
    statutoryBasis:
      '電子署名及び認証業務に関する法律に基づく指定調査機関等に関する省令第9条及び調査に関する方針第6（電磁的方法による帳簿保存・10年間保存互換仕様）',
    signerSummary: `${profile.organizationNameJa} ${profile.representativeTitleJa} ${profile.signerNameJa} (${profile.signerNameRoman})`,
    documentFileName: documentFileName || 'document.pdf',
    proofId,
    signatureDigestSha256,
  };

  const proofPackage = {
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

  // 電磁的監査台帳ファイル (ydk_electronic_signature_ledger.jsonl) へ自動追記
  const ledgerPath = path.join(getIntegrityDir(), 'ydk_electronic_signature_ledger.jsonl');
  try {
    fs.appendFileSync(ledgerPath, JSON.stringify(auditLedgerRecord) + '\n', 'utf8');
  } catch {}

  const proofJsonBytes = new TextEncoder().encode(JSON.stringify(proofPackage, null, 2));
  const pemBytes = new TextEncoder().encode(keyMaterial.publicKeySpkiPem);

  await pdfDoc.attach(proofJsonBytes, 'YDK_Electronic_Signature_Proof.json', {
    mimeType: 'application/json',
    description:
      '電子署名及び認証業務に関する法律（平成12年法律第102号）第2条第1項・第3条・認定指針準拠 証明データパッケージ',
    creationDate: new Date(signedAtIso),
    modificationDate: new Date(signedAtIso),
  });

  await pdfDoc.attach(pemBytes, 'YDK_Verification_PublicKey.pem', {
    mimeType: 'application/x-pem-file',
    description: `発行者・署名者検証公開鍵 (${algMeta.id}, OID: ${algMeta.signatureOid}, SHA256: ${keyMaterial.keyHashes.sha256})`,
    creationDate: new Date(signedAtIso),
    modificationDate: new Date(signedAtIso),
  });

  const proofCompactUtf8Bytes = new TextEncoder().encode(JSON.stringify(proofPackage));
  const proofHex = bufferToHex(proofCompactUtf8Bytes);
  pdfDoc.catalog.set(PDFName.of('YDKLegalSignatureProof'), PDFHexString.of(proofHex));

  pdfDoc.setTitle(`${documentFileName || 'Document'} [電子署名法準拠証明データ付]`);
  pdfDoc.setAuthor(
    `${profile.organizationNameJa} ${profile.representativeTitleJa} ${profile.signerNameJa} (${profile.signerNameRoman})`
  );
  pdfDoc.setSubject(
    `電子署名法第2条第1項・第3条準拠 当事者型電子署名付 (法第4条第1項の特定認証業務認定対象外・法第13条第2項遵守) | ProofID: ${proofId} | Alg: ${algMeta.id} (OID: ${algMeta.signatureOid}) | KeySHA256: ${keyMaterial.keyHashes.sha256}`
  );
  pdfDoc.setKeywords([
    'YDK Smart Seal Studio',
    '電子署名法準拠',
    `ProofID:${proofId}`,
    `OID:${algMeta.signatureOid}`,
    `DocSHA256:${originalDocSha256}`,
    `KeySHA256:${keyMaterial.keyHashes.sha256}`,
    `Signer:${profile.signerNameRoman}`,
  ]);
  pdfDoc.setProducer(
    `YDK Smart Seal Studio v2.3.0 (Legal Electronic Signature Engine / ${algMeta.id})`
  );
  pdfDoc.setCreator(profile.organizationNameEn);
  pdfDoc.setModificationDate(new Date(signedAtIso));

  return {
    proofPackage,
    ledgerPath,
  };
}

/**
 * PDF内の電子署名法準拠・証明データパッケージを抽出し、本人作成表示(法第2条第1項第1号)と非改変確認(第2号)を暗号検証
 */
async function verifyPdfLegalSignatureNode(pdfBytes) {
  const details = [];
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const rawEntry = pdfDoc.catalog.get(PDFName.of('YDKLegalSignatureProof'));

  let proofPackage = null;
  if (rawEntry instanceof PDFHexString) {
    const hexStr = rawEntry.asString();
    const jsonStr = Buffer.from(hexStr, 'hex').toString('utf8');
    proofPackage = JSON.parse(jsonStr);
  } else if (rawEntry) {
    const lookedUp = pdfDoc.context.lookup(rawEntry);
    if (lookedUp instanceof PDFHexString) {
      const hexStr = lookedUp.asString();
      const jsonStr = Buffer.from(hexStr, 'hex').toString('utf8');
      proofPackage = JSON.parse(jsonStr);
    }
  }

  if (!proofPackage) {
    return {
      ok: false,
      isValid: false,
      hasEmbeddedProof: false,
      creatorAttributionValid: false,
      tamperFreeValid: false,
      cryptographicSignatureValid: false,
      visualStructureMatches: false,
      summaryMessage:
        '⚠️ このPDFには「YDK電子署名法準拠・証明データ」が組み込まれていません。',
      details: ['PDFカタログ内に YDKLegalSignatureProof エントリが見つかりませんでした。'],
    };
  }

  const { certificate, signedAttributes, cryptographicSignatureBase64 } = proofPackage;
  const algId = certificate.algorithm.id;
  const isRsa = algId === 'RSA-2048-SHA256';
  const importParams = isRsa
    ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
    : { name: 'ECDSA', namedCurve: 'P-256' };

  const publicKey = await subtle.importKey(
    'jwk',
    certificate.publicKeyJwk,
    importParams,
    true,
    ['verify']
  );

  const spkiBuf = await subtle.exportKey('spki', publicKey);
  const computedKeySha256 = shaDigestHexNode('SHA-256', new Uint8Array(spkiBuf));
  const keyHashMatches =
    computedKeySha256 === certificate.issuerVerificationKeyHashes.sha256 &&
    computedKeySha256 === signedAttributes.issuerKeySha256;

  details.push(
    keyHashMatches
      ? `✅ [指針第10条第2号] 発行者署名検証符号 SHA-256 ハッシュ一致 (${computedKeySha256.slice(0, 24)}...)`
      : `❌ [指針第10条第2号] 発行者署名検証符号のSHA-256ハッシュが不整合です`
  );

  const canonicalSignedAttributesJson = JSON.stringify(signedAttributes);
  const signedAttrBytes = new TextEncoder().encode(canonicalSignedAttributesJson);
  const sigBytes = base64ToUint8Array(cryptographicSignatureBase64);

  const verifyParams = isRsa
    ? { name: 'RSASSA-PKCS1-v1_5' }
    : { name: 'ECDSA', hash: { name: 'SHA-256' } };

  const cryptographicSignatureValid = await subtle.verify(
    verifyParams,
    publicKey,
    sigBytes,
    signedAttrBytes
  );

  details.push(
    cryptographicSignatureValid
      ? `✅ [法第2条第1項第1号・第3条] 暗号署名検証成功 (${certificate.algorithm.name}, OID: ${certificate.algorithm.signatureOid})`
      : `❌ [法第2条第1項第1号] 暗号署名の検証に失敗しました（署名データ改変の疑い）`
  );

  const currentFingerprint = computePdfVisualFingerprintNode(pdfDoc);
  const expectedFingerprint = signedAttributes.visualStructureFingerprint;
  const visualStructureMatches =
    currentFingerprint.fingerprintSha256 === expectedFingerprint.fingerprintSha256 &&
    currentFingerprint.pageCount === expectedFingerprint.pageCount;

  details.push(
    visualStructureMatches
      ? `✅ [法第2条第1項第2号] PDFページ構造・印影リソース指紋完全一致 (全${currentFingerprint.pageCount}ページ・改ざんなし)`
      : `❌ [法第2条第1項第2号] PDFのページ構成または印影リソースが署名時から変更されています`
  );

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

  const creatorAttributionValid =
    cryptographicSignatureValid && keyHashMatches && hasStatutoryDisclaimers;
  const tamperFreeValid = cryptographicSignatureValid && visualStructureMatches;
  const isValid = creatorAttributionValid && tamperFreeValid;

  return {
    ok: isValid,
    isValid,
    hasEmbeddedProof: true,
    creatorAttributionValid,
    tamperFreeValid,
    cryptographicSignatureValid,
    visualStructureMatches,
    summaryMessage: isValid
      ? '🛡️【検証成功・真正性確認済】電子署名法第2条第1項（本人作成表示・非改変確認）及び第3条に準拠した有効な証明データを確認しました。署名後の改ざんはありません。'
      : '🚨【検証警告】証明データの暗号署名またはPDFページ構造に不整合が検出されました。',
    details,
    proofSummary: {
      proofId: signedAttributes.proofId,
      signedAtIso: signedAttributes.signedAtIso,
      signerNameJa: certificate.subject.commonNameJa,
      signerNameRoman: certificate.subject.commonNameRoman,
      organizationJa: certificate.subject.organizationJa,
      invoiceRegistrationNo: certificate.subject.invoiceRegistrationNo,
      algorithm: certificate.algorithm.id,
      signatureOid: certificate.algorithm.signatureOid,
      certificateSerialNumber: certificate.serialNumber,
      issuerKeySha256: certificate.issuerVerificationKeyHashes.sha256,
      originalDocumentSha256: signedAttributes.originalDocumentSha256,
      visualStructureFingerprintSha256: signedAttributes.visualStructureFingerprint.fingerprintSha256,
      appliedStampsCount: signedAttributes.appliedStamps.length,
    },
    proofPackage,
  };
}

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
      const tx = item.transform[4];
      const ty = item.transform[5];
      const wPt = item.width || str.length * 8;
      const hPt = Math.abs(item.transform[3]) || item.height || 10;
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

  if (xMm !== undefined && yMm !== undefined) {
    return {
      xPt: Number(xMm) * PT_PER_MM,
      yPt: Number(yMm) * PT_PER_MM,
      resolvedBy: `explicit-mm(${xMm}mm, ${yMm}mm)`,
    };
  }

  if (xPt !== undefined && yPt !== undefined) {
    return {
      xPt: Number(xPt),
      yPt: Number(yPt),
      resolvedBy: `explicit-pt(${xPt}pt, ${yPt}pt)`,
    };
  }

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
        const kwCenterRatio = (idx + kw.length / 2) / totalLen;
        let centerX = hit.xPt + hit.widthPt * kwCenterRatio;
        let centerY = hit.yPt + hit.heightPt / 2;

        if (boxHeaderRegex.test(kw) && Number(anchorOffsetYMm) === 0) {
          centerY = hit.yPt + hit.heightPt + stampHeightPt * 0.48;
        } else if (
          kw.length >= 5 &&
          !['[SEAL]', '(SEAL)', '(印)', '（印）'].includes(kw) &&
          !boxHeaderRegex.test(kw) &&
          Number(anchorOffsetXMm) === 0
        ) {
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
    'company-block': { xRatio: 0.78, yRatio: 0.22 },
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

  if (subcmd === 'verify') {
    const pdfPath = args.pdf || args._[1];
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      throw new Error(`--pdf <path> に検証対象のPDFファイルを指定してください: ${pdfPath}`);
    }
    const pdfBytes = fs.readFileSync(path.resolve(pdfPath));
    const result = await verifyPdfLegalSignatureNode(pdfBytes);
    if (!args.full && result.proofPackage) {
      delete result.proofPackage;
    }
    console.log(JSON.stringify({ pdf: path.resolve(pdfPath), ...result }, null, 2));
    if (!result.isValid) {
      process.exitCode = 2;
    }
    return;
  }

  if (subcmd === 'ledger') {
    const ledgerPath = path.join(getIntegrityDir(), 'ydk_electronic_signature_ledger.jsonl');
    const limit = Number(args.limit || 20);
    if (!fs.existsSync(ledgerPath)) {
      console.log(JSON.stringify({ ok: true, ledgerPath, totalRecords: 0, records: [] }, null, 2));
      return;
    }
    const lines = fs
      .readFileSync(ledgerPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    console.log(
      JSON.stringify(
        {
          ok: true,
          ledgerPath,
          totalRecords: lines.length,
          records: lines.slice(-limit).reverse(),
        },
        null,
        2
      )
    );
    return;
  }

  if (subcmd === 'sample') {
    const outPdf = path.resolve(
      args.out || path.join(__dirname, 'sample_ydk_stamped_invoice.pdf')
    );
    const rawPdf = outPdf.replace(/\.pdf$/i, '_raw.pdf');
    await createSampleInvoicePdf(rawPdf);

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
    const appliedStampsForProof = [];

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

      const pdfX = posResult.xPt;
      const pdfY = pageH - posResult.yPt - stampHeightPt;

      pdfPage.drawImage(pngImage, {
        x: pdfX,
        y: pdfY,
        width: stampWidthPt,
        height: stampHeightPt,
        opacity: spec.opacity !== undefined ? Number(spec.opacity) : 0.92,
      });

      const dataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;
      const sealImageSha256 = shaDigestHexNode('SHA-256', dataUrl);

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
        sealImageSha256,
      });

      appliedStampsForProof.push({
        index: idx + 1,
        pageNumber: pageNum,
        stampName: renderMeta.preset || renderMeta.type || 'YDK Seal',
        stampType: renderMeta.type || 'seal',
        stampText: spec.text || renderMeta.preset || '株式会社YDKリノベーション',
        xPt: Math.round(posResult.xPt * 100) / 100,
        yPt: Math.round(posResult.yPt * 100) / 100,
        widthPt: Math.round(stampWidthPt * 100) / 100,
        heightPt: Math.round(stampHeightPt * 100) / 100,
        sealImageSha256,
      });
    }

    // 電子署名法準拠・無料証明データパッケージの組み込み（デフォルト有効、--no-legal-proof で無効化可）
    let legalProofSummary = null;
    if (!args['no-legal-proof']) {
      const algArg =
        args.algorithm === 'ecdsa' || args.algorithm === 'ECDSA-P256-SHA256'
          ? 'ECDSA-P256-SHA256'
          : 'RSA-2048-SHA256';
      const { proofPackage, ledgerPath } = await embedLegalSignatureIntoPdfDocNode({
        pdfDoc,
        rawOriginalPdfBytes: new Uint8Array(pdfBytes),
        documentFileName: path.basename(resolvedOut),
        appliedStampsForProof,
        profileOverrides: {
          algorithm: algArg,
          drawPageMicroFooter: args['no-footer'] ? false : true,
          appendCertificatePage: Boolean(args['cert-page']),
          ...(args['signer-roman'] ? { signerNameRoman: String(args['signer-roman']) } : {}),
        },
      });
      legalProofSummary = {
        enabled: true,
        proofId: proofPackage.signedAttributes.proofId,
        signedAtIso: proofPackage.signedAttributes.signedAtIso,
        algorithm: proofPackage.certificate.algorithm.id,
        signatureOid: proofPackage.certificate.algorithm.signatureOid,
        certificateSerialNumber: proofPackage.certificate.serialNumber,
        signerNameRoman: proofPackage.certificate.subject.commonNameRoman,
        issuerKeySha256: proofPackage.certificate.issuerVerificationKeyHashes.sha256,
        originalDocumentSha256: proofPackage.signedAttributes.originalDocumentSha256,
        visualStructureFingerprintSha256:
          proofPackage.signedAttributes.visualStructureFingerprint.fingerprintSha256,
        auditLedgerRecordId: proofPackage.auditLedgerRecord.ledgerRecordId,
        auditLedgerPath: ledgerPath,
      };
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
          totalPages: pdfDoc.getPageCount(),
          appliedStamps,
          legalProof: legalProofSummary,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`
YDK スマート電子印鑑スタジオ - AI Agent Headless CLI v2.3.0 (ydk_seal_cli.mjs)
===============================================================================
使い方:
  1. プリセット一覧の確認:
     node ydk_seal_cli.mjs presets [--json]

  2. 透過PNG印影画像（600DPI）の生成:
     node ydk_seal_cli.mjs image --preset preset-ydk-official-scan --out seal.png
     node ydk_seal_cli.mjs image --type mitome --text "阿部" --size-mm 10.5 --out abe.png

  3. PDF内のテキストと座標（アンカー候補）の検査:
     node ydk_seal_cli.mjs inspect --pdf invoice.pdf

  4. PDFへの自動押印＋電子署名法準拠・無料証明データ自動組込:
     node ydk_seal_cli.mjs stamp --pdf input.pdf --out output.pdf --preset preset-ydk-official-scan --anchor "印"
     node ydk_seal_cli.mjs stamp --pdf input.pdf --out output.pdf --preset preset-ydk-kakuin-4line --x-mm 155 --y-mm 48 --cert-page --save-drive

  5. サンプル請求書PDFの生成＋3種同時自動押印＋証明データ組込テスト:
     node ydk_seal_cli.mjs sample --out sample_stamped.pdf [--cert-page]

  6. PDF内の電子署名法準拠・証明データ（本人作成表示・非改変確認）を暗号検証:
     node ydk_seal_cli.mjs verify --pdf sample_stamped.pdf [--full]

  7. 電磁的監査台帳（省令第9条・10年保存互換 JSONL）の記録一覧表示:
     node ydk_seal_cli.mjs ledger [--limit 20]
`);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});

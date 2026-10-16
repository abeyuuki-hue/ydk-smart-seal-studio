/**
 * 電子署名法及び関連省令・指針（全6文書）準拠 無料証明データ設定＆検証パネル
 * (src/components/LegalProofPanel.tsx)
 */

import React, { useState } from 'react';
import {
  LegalSignerProfile,
  SupportedAlgorithmId,
  ALGORITHM_METADATA_MAP,
  YDKLegalSignatureProofPackage,
  LegalVerificationResult,
  getLocalSignatureAuditLedger,
  downloadJsonText,
} from '../utils/legalSignatureEngine';

interface LegalProofPanelProps {
  enableLegalProof: boolean;
  onToggleEnableLegalProof: (enabled: boolean) => void;
  signerProfile: LegalSignerProfile;
  onChangeSignerProfile: (profile: LegalSignerProfile) => void;
  latestProof: YDKLegalSignatureProofPackage | null;
  verificationResult: LegalVerificationResult | null;
  onVerifyCurrentPdf: () => void;
  onGenerateAndInspectProof: () => void;
  isProcessing: boolean;
}

export const LegalProofPanel: React.FC<LegalProofPanelProps> = ({
  enableLegalProof,
  onToggleEnableLegalProof,
  signerProfile,
  onChangeSignerProfile,
  latestProof,
  verificationResult,
  onVerifyCurrentPdf,
  onGenerateAndInspectProof,
  isProcessing,
}) => {
  const [showDetailSettings, setShowDetailSettings] = useState(false);
  const [showCertModal, setShowCertModal] = useState(false);

  const algMeta = ALGORITHM_METADATA_MAP[signerProfile.algorithm];

  const handleExportAuditLedger = () => {
    const ledger = getLocalSignatureAuditLedger();
    if (ledger.length === 0 && latestProof) {
      ledger.push(latestProof.auditLedgerRecord);
    }
    const jsonl = ledger.map((r) => JSON.stringify(r)).join('\n');
    downloadJsonText(jsonl || '{}', 'ydk_electronic_signature_ledger.jsonl');
  };

  const handleExportLatestProofJson = () => {
    if (!latestProof) return;
    downloadJsonText(
      JSON.stringify(latestProof, null, 2),
      `${latestProof.signedAttributes.proofId}_証明データ.json`
    );
  };

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #f8fafc 0%, #eff6ff 100%)',
        border: '1.5px solid #bfdbfe',
        borderRadius: '10px',
        padding: '12px',
        marginBottom: '12px',
        boxShadow: '0 2px 6px rgba(30, 64, 175, 0.07)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '16px' }}>🛡️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1e3a8a' }}>
              電子署名法準拠・無料証明データ
            </div>
            <div style={{ fontSize: '10.5px', color: '#475569' }}>
              法第2条第1項(本人作成・非改変)・第3条・認定指針準拠
            </div>
          </div>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            fontWeight: 700,
            color: enableLegalProof ? '#15803d' : '#64748b',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={enableLegalProof}
            onChange={(e) => onToggleEnableLegalProof(e.target.checked)}
          />
          {enableLegalProof ? '自動組込ON (無料)' : 'OFF'}
        </label>
      </div>

      {enableLegalProof && (
        <>
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #dbeafe',
              borderRadius: '7px',
              padding: '8px 10px',
              fontSize: '11px',
              color: '#1e293b',
              marginBottom: '8px',
              lineHeight: 1.45,
            }}
          >
            <div>
              <strong>署名者:</strong> {signerProfile.representativeTitleJa} {signerProfile.signerNameJa}{' '}
              <span style={{ color: '#2563eb', fontWeight: 600 }}>
                ({signerProfile.signerNameRoman})
              </span>
            </div>
            <div>
              <strong>暗号方式(指針第3条):</strong>{' '}
              <span style={{ fontFamily: 'monospace', fontSize: '10.5px', color: '#0f172a' }}>
                {algMeta.id} (OID: {algMeta.signatureOid})
              </span>
            </div>
            <div>
              <strong>法定区分(法第13条2項):</strong> 当事者型・自社管理型電子署名（特定認証業務認定対象外明記済）
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '8px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11.5px',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={signerProfile.drawPageMicroFooter}
                onChange={(e) =>
                  onChangeSignerProfile({
                    ...signerProfile,
                    drawPageMicroFooter: e.target.checked,
                  })
                }
              />
              ページ下部に電子署名検証ID・SHA-256刻印を印字
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11.5px',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={signerProfile.appendCertificatePage}
                onChange={(e) =>
                  onChangeSignerProfile({
                    ...signerProfile,
                    appendCertificatePage: e.target.checked,
                  })
                }
              />
              巻末に「電子署名法準拠 署名検証証明書」ページを追加
            </label>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onGenerateAndInspectProof}
              disabled={isProcessing}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: '11.5px',
                fontWeight: 700,
                background: '#1d4ed8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              🔏 証明データを生成・検証
            </button>
            <button
              type="button"
              onClick={onVerifyCurrentPdf}
              disabled={isProcessing}
              style={{
                padding: '6px 8px',
                fontSize: '11.5px',
                fontWeight: 600,
                background: '#0f766e',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
              title="読み込んだPDFに埋め込まれている証明データの改ざん検証を実行"
            >
              🔍 読込PDF検証
            </button>
            <button
              type="button"
              onClick={() => setShowDetailSettings((prev) => !prev)}
              style={{
                padding: '6px 8px',
                fontSize: '11px',
                background: '#e2e8f0',
                color: '#1e293b',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              ⚙️ {showDetailSettings ? '閉じる' : '詳細設定'}
            </button>
          </div>

          {showDetailSettings && (
            <div
              style={{
                marginTop: '10px',
                paddingTop: '10px',
                borderTop: '1px dashed #cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontSize: '11.5px',
              }}
            >
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '2px' }}>
                  暗号アルゴリズム (指針第3条 OID基準):
                </label>
                <select
                  value={signerProfile.algorithm}
                  onChange={(e) =>
                    onChangeSignerProfile({
                      ...signerProfile,
                      algorithm: e.target.value as SupportedAlgorithmId,
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    borderRadius: '5px',
                    border: '1px solid #cbd5e1',
                    fontSize: '11px',
                  }}
                >
                  <option value="RSA-2048-SHA256">
                    RSA-2048 + SHA-256 (OID: 1.2.840.113549.1.1.11 / 指針第3条第1号イ)
                  </option>
                  <option value="ECDSA-P256-SHA256">
                    ECDSA P-256 + SHA-256 (OID: 1.2.840.10045.4.3.2 / 指針第3条第1号ロ)
                  </option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '2px' }}>
                  法人名・商号 (日本語):
                </label>
                <input
                  type="text"
                  value={signerProfile.organizationNameJa}
                  onChange={(e) =>
                    onChangeSignerProfile({
                      ...signerProfile,
                      organizationNameJa: e.target.value,
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    borderRadius: '5px',
                    border: '1px solid #cbd5e1',
                    fontSize: '11px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '2px' }}>
                    署名者氏名:
                  </label>
                  <input
                    type="text"
                    value={signerProfile.signerNameJa}
                    onChange={(e) =>
                      onChangeSignerProfile({
                        ...signerProfile,
                        signerNameJa: e.target.value,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      borderRadius: '5px',
                      border: '1px solid #cbd5e1',
                      fontSize: '11px',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '2px' }}>
                    ローマ字表記 (指針第9条):
                  </label>
                  <input
                    type="text"
                    value={signerProfile.signerNameRoman}
                    onChange={(e) =>
                      onChangeSignerProfile({
                        ...signerProfile,
                        signerNameRoman: e.target.value,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      borderRadius: '5px',
                      border: '1px solid #cbd5e1',
                      fontSize: '11px',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '2px' }}>
                  電子証明書の用途 (指針第9条・第11条):
                </label>
                <input
                  type="text"
                  value={signerProfile.certificatePurpose}
                  onChange={(e) =>
                    onChangeSignerProfile({
                      ...signerProfile,
                      certificatePurpose: e.target.value,
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    borderRadius: '5px',
                    border: '1px solid #cbd5e1',
                    fontSize: '11px',
                  }}
                />
              </div>
            </div>
          )}

          {verificationResult && (
            <div
              style={{
                marginTop: '10px',
                padding: '9px 10px',
                borderRadius: '7px',
                background: verificationResult.isValid ? '#f0fdf4' : '#fef2f2',
                border: `1.5px solid ${verificationResult.isValid ? '#86efac' : '#fca5a5'}`,
                fontSize: '11px',
                color: '#0f172a',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  color: verificationResult.isValid ? '#166534' : '#991b1b',
                  marginBottom: '5px',
                }}
              >
                {verificationResult.summaryMessage}
              </div>
              <ul style={{ margin: '0 0 6px 16px', padding: 0, lineHeight: 1.4 }}>
                {verificationResult.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                {latestProof && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowCertModal(true)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: '#1e40af',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                      }}
                    >
                      📜 証明書・法定事項を表示
                    </button>
                    <button
                      type="button"
                      onClick={handleExportLatestProofJson}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        background: '#334155',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                      }}
                    >
                      💾 証明JSON保存
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleExportAuditLedger}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: '#475569',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                  }}
                  title="指定調査機関省令第9条・調査方針第6準拠の電磁的帳簿（JSONL）を出力"
                >
                  📒 監査台帳出力(省令9条)
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showCertModal && latestProof && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setShowCertModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              maxWidth: '760px',
              width: '100%',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: '20px 24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              color: '#0f172a',
              fontSize: '12.5px',
              lineHeight: 1.55,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #1e3a8a',
                paddingBottom: '10px',
                marginBottom: '14px',
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: '17px', color: '#1e3a8a' }}>
                  🛡️ 電子署名及び認証業務に関する法律準拠 証明データ詳細
                </h2>
                <div style={{ fontSize: '11.5px', color: '#475569' }}>
                  Proof ID: {latestProof.signedAttributes.proofId} | Serial:{' '}
                  {latestProof.certificate.serialNumber}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCertModal(false)}
                style={{
                  background: '#e2e8f0',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✕ 閉じる
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: '4px' }}>
                  👤 署名者・利用者情報（指針第9条準拠）
                </div>
                <div><strong>法人名:</strong> {latestProof.certificate.subject.organizationJa}</div>
                <div><strong>代表者・氏名:</strong> {latestProof.certificate.subject.commonNameJa}</div>
                <div><strong>ローマ字表記:</strong> {latestProof.certificate.subject.commonNameRoman}</div>
                <div><strong>所在地:</strong> {latestProof.certificate.subject.addressJa}</div>
                <div><strong>登録番号:</strong> {latestProof.certificate.subject.invoiceRegistrationNo}</div>
              </div>

              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: '4px' }}>
                  🔐 暗号方式・OID（指針第3条・第10条準拠）
                </div>
                <div><strong>方式名:</strong> {latestProof.certificate.algorithm.name}</div>
                <div><strong>署名OID:</strong> <code>{latestProof.certificate.algorithm.signatureOid}</code></div>
                <div><strong>ハッシュOID:</strong> <code>{latestProof.certificate.algorithm.hashOid}</code></div>
                <div><strong>鍵強度:</strong> {latestProof.certificate.algorithm.keyLengthDescription}</div>
                <div><strong>署名日時:</strong> {latestProof.signedAttributes.signedAtIso}</div>
              </div>
            </div>

            <div
              style={{
                background: '#f1f5f9',
                padding: '10px 12px',
                borderRadius: '8px',
                marginBottom: '12px',
                fontFamily: 'monospace',
                fontSize: '11px',
                wordBreak: 'break-all',
              }}
            >
              <div>
                <strong>[法第2条第1項第2号] 原文PDF SHA-256:</strong>{' '}
                {latestProof.signedAttributes.originalDocumentSha256}
              </div>
              <div>
                <strong>[法第2条第1項第2号] ページ＆印影構造指紋 SHA-256:</strong>{' '}
                {latestProof.signedAttributes.visualStructureFingerprint.fingerprintSha256}
              </div>
              <div>
                <strong>[指針第10条第2号] 発行者署名検証符号 SHA-256:</strong>{' '}
                {latestProof.certificate.issuerVerificationKeyHashes.sha256}
              </div>
              <div>
                <strong>[指針第10条第2号] 発行者署名検証符号 SHA-384:</strong>{' '}
                {latestProof.certificate.issuerVerificationKeyHashes.sha384}
              </div>
              <div>
                <strong>[指針第10条第2号] 発行者署名検証符号 SHA-512:</strong>{' '}
                {latestProof.certificate.issuerVerificationKeyHashes.sha512}
              </div>
            </div>

            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                padding: '10px 12px',
                borderRadius: '8px',
                marginBottom: '12px',
                fontSize: '11.5px',
              }}
            >
              <div style={{ fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>
                ⚖️ 法定遵守事項・誤認防止表示（法第13条第2項・指針第8条/10条/11条/12条）
              </div>
              <p style={{ margin: '0 0 6px 0' }}>
                {latestProof.certificate.statutoryDisclaimers.article13Paragraph2Statement}
              </p>
              <p style={{ margin: '0 0 6px 0' }}>
                {latestProof.certificate.statutoryDisclaimers.attributeScopeStatement}
              </p>
              <p style={{ margin: '0 0 6px 0' }}>
                {latestProof.certificate.verifierDisclosure.verificationInstruction}
              </p>
              <p style={{ margin: 0 }}>
                {latestProof.certificate.verifierDisclosure.governingLawAndJurisdiction}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={handleExportLatestProofJson}
                style={{
                  padding: '7px 14px',
                  background: '#1d4ed8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                💾 証明データJSONをダウンロード
              </button>
              <button
                type="button"
                onClick={handleExportAuditLedger}
                style={{
                  padding: '7px 14px',
                  background: '#0f766e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                📒 電磁的監査台帳 (JSONL) を出力
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

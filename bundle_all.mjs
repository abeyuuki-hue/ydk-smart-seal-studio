import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execSync } from 'child_process';

const VERSION = '2.3.0';
const projectDir = 'C:\\Users\\user\\OneDrive\\GING\\pdf-stamp-webapp';
const distDir = path.join(projectDir, 'dist');
const assetsDir = path.join(distDir, 'assets');

const htmlTemplate = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
const assetFiles = fs.readdirSync(assetsDir);
const cssFile = assetFiles.find((f) => f.endsWith('.css'));
const jsFile = assetFiles.find((f) => f.endsWith('.js'));

if (!cssFile || !jsFile) {
  throw new Error('Built CSS or JS asset not found in dist/assets');
}

const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');

// 1. 単一HTMLバンドル生成（GAS・Googleドライブ単体起動用）
// String.prototype.replace の $ 特殊展開を防ぐため関数渡しを使用
const singleHtml = htmlTemplate
  .replace(/<link[^>]+href="[^"]*assets\/[^"]+\.css"[^>]*>/i, () => `<style>\n${cssContent}\n</style>`)
  .replace(
    /<script[^>]+src="[^"]*assets\/[^"]+\.js"[^>]*><\/script>/i,
    () => `<script type="module">\n${jsContent}\n</script>`
  );

const singleFileTargets = [
  'C:\\Users\\user\\マイドライブ\\YDK_スマート電子印鑑スタジオ_Web版\\index.html',
  'C:\\Users\\user\\マイドライブ\\YDK_スマート電子印鑑スタジオ_Web版\\YDK_スマート電子印鑑スタジオ.html',
  'C:\\Users\\user\\マイドライブ\\パパッと電子印鑑_Web版\\index.html',
  'C:\\Users\\user\\マイドライブ\\パパッと電子印鑑_Web版\\パパッと電子印鑑3PRO_Web版.html',
  'C:\\Users\\user\\マイドライブ\\YDK_System_Root\\03_MicroApps\\Papatto_Denshi_Inkan\\index.html',
  'C:\\Users\\user\\マイドライブ\\YDK_System_Root\\03_MicroApps\\YDK_Smart_Seal_Studio\\index.html',
  'C:\\Users\\user\\.ydk_clasp_cache\\papatto_denshi_inkan\\index.html',
];

for (const target of singleFileTargets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, singleHtml, 'utf8');
  console.log('[SingleHTML Saved]', target, `(${(singleHtml.length / 1024 / 1024).toFixed(2)} MB)`);
}

// 2. Chrome拡張機能 (Manifest V3) パッケージ生成
const extDirs = [
  'C:\\Users\\user\\YDK_スマート電子印鑑スタジオ_Chrome拡張版',
  'C:\\Users\\user\\マイドライブ\\YDK_スマート電子印鑑スタジオ_Chrome拡張版',
  'C:\\Users\\user\\OneDrive\\GING\\YDK_Smart_Seal_Chrome_Extension',
];

function removeIllegalExtensionFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeIllegalExtensionFiles(fullPath);
    } else if (/^(desktop\.ini|thumbs\.db|\.ds_store)$/i.test(entry.name)) {
      try {
        fs.chmodSync(fullPath, 0o666);
      } catch {}
      try {
        fs.unlinkSync(fullPath);
        console.log('[Removed illegal file]', fullPath);
      } catch (e) {
        console.warn('[Failed to remove illegal file]', fullPath, e.message);
      }
    }
  }
}

const extHtml = htmlTemplate
  .replace(/href="[^"]*assets\//g, 'href="./assets/')
  .replace(/src="[^"]*assets\//g, 'src="./assets/')
  .replace('</body>', '  <script src="./extension-helper.js"></script>\n  </body>');

const extHelperJs = `// YDK スマート電子印鑑スタジオ Chrome拡張ヘルパー v${VERSION}
(function() {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    window.addEventListener('DOMContentLoaded', () => {
      const isSidePanel = window.innerWidth < 600;
      if (isSidePanel) {
        const bar = document.createElement('div');
        bar.style.cssText = 'background:#0f172a;color:#fff;padding:6px 10px;display:flex;justify-content:space-between;align-items:center;font-size:12px;border-bottom:1px solid #334155;';
        bar.innerHTML = '<span>🧩 Chromeサイドパネルモード (v${VERSION})</span><button id="ydk-open-full-tab" style="background:#3b82f6;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:bold;cursor:pointer;">🖥️ 大画面タブで開く</button>';
        document.body.prepend(bar);
        document.getElementById('ydk-open-full-tab')?.addEventListener('click', () => {
          chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
        });
      }
    });
  }
})();
`;

const backgroundJs = `/**
 * YDK スマート電子印鑑スタジオ - Chrome Extension Service Worker (Manifest V3) v${VERSION}
 */
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('sidePanel behavior error:', err);
    });
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ydk-seal-open-sidepanel',
      title: '💮 YDK スマート電子印鑑スタジオ（サイドパネル）を開く',
      contexts: ['all'],
    });
    chrome.contextMenus.create({
      id: 'ydk-seal-open-tab',
      title: '🖥️ YDK スマート電子印鑑スタジオ（大画面タブ）を開く',
      contexts: ['all'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ydk-seal-open-sidepanel' && tab && tab.windowId) {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
      });
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    }
  } else if (info.menuItemId === 'ydk-seal-open-tab') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  }
});
`;

const manifestJson = {
  manifest_version: 3,
  name: 'YDK スマート電子印鑑スタジオ (YDK Smart Seal Studio)',
  short_name: 'YDK電子印鑑',
  version: VERSION,
  description:
    '代表者印・会社角印・認印・日付データ印の600DPI透過生成、PDF直感押印、および電子署名法準拠の無料・暗号証明データ自動組込＆検証を備えたYDK謹製Chrome拡張機能。',
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_title: 'YDK スマート電子印鑑スタジオを開く',
    default_icon: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },
  side_panel: {
    default_path: 'index.html',
  },
  background: {
    service_worker: 'background.js',
  },
  permissions: ['sidePanel', 'contextMenus', 'storage', 'activeTab'],
};

function createSealIconPng(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const outerR = size * 0.45;
  const innerR = size * 0.34;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist <= outerR) {
        const isRing = dist >= innerR && dist <= outerR;
        const isCrossBar =
          dist < innerR * 0.85 &&
          (Math.abs(x - cx) <= Math.max(1, size * 0.08) ||
            Math.abs(y - cy) <= Math.max(1, size * 0.08));
        if (isRing || isCrossBar) {
          raw[px] = 216;
          raw[px + 1] = 0;
          raw[px + 2] = 22;
          raw[px + 3] = 255;
        } else {
          raw[px] = 255;
          raw[px + 1] = 248;
          raw[px + 2] = 248;
          raw[px + 3] = 255;
        }
      } else {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
      }
    }
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const iconBuffers = {
  16: createSealIconPng(16),
  48: createSealIconPng(48),
  128: createSealIconPng(128),
};

function populateExtensionDir(extDir) {
  const extAssetsDir = path.join(extDir, 'assets');
  const extIconsDir = path.join(extDir, 'icons');
  if (fs.existsSync(extAssetsDir)) {
    fs.rmSync(extAssetsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(extAssetsDir, { recursive: true });
  fs.mkdirSync(extIconsDir, { recursive: true });

  fs.copyFileSync(path.join(assetsDir, cssFile), path.join(extAssetsDir, cssFile));
  fs.copyFileSync(path.join(assetsDir, jsFile), path.join(extAssetsDir, jsFile));

  fs.writeFileSync(path.join(extDir, 'index.html'), extHtml, 'utf8');
  fs.writeFileSync(path.join(extDir, 'extension-helper.js'), extHelperJs, 'utf8');
  fs.writeFileSync(path.join(extDir, 'background.js'), backgroundJs, 'utf8');
  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifestJson, null, 2), 'utf8');

  for (const sz of [16, 48, 128]) {
    fs.writeFileSync(path.join(extIconsDir, `icon${sz}.png`), iconBuffers[sz]);
  }

  removeIllegalExtensionFiles(extDir);
}

for (const extDir of extDirs) {
  populateExtensionDir(extDir);
  console.log('[Chrome Extension MV3 Saved & Cleaned]', extDir);
}

// 3. 完成パッケージ（Release Package v2.3.0）の構築
const readmeContent = `# 💮 YDK スマート電子印鑑スタジオ (YDK Smart Seal Studio) v${VERSION} 完成パッケージ

株式会社YDKリノベーション / やればできるこJAPAN株式会社 謹製
**「パパっと電子印鑑（Makeestamp3Pro）」完全上位互換 ＋ 電子署名及び認証業務に関する法律（全6法令・指針）100%無料準拠 証明データエンジン搭載**

---

## 📦 パッケージ構成（全4エディション同梱）

### ① \`01_Webアプリ単体完結版\`
- **ファイル:** \`YDK_スマート電子印鑑スタジオ_v${VERSION}.html\` / \`起動_YDKスマート電子印鑑スタジオ.bat\`
- **特徴:** インストール不要・サーバー不要。HTMLファイルをダブルクリックするだけで、フォント・600DPI印影エンジン・PDFプレビュー・電子署名法準拠証明データエンジンのすべてが単体で動作します。
- **オンラインWeb版URL:** https://abeyuuki-hue.github.io/ydk-smart-seal-studio/

### ② \`02_Chrome拡張機能版_MV3\`
- **フォルダ:** \`YDK_Smart_Seal_Chrome_Extension\`（展開済みフォルダ・\`desktop.ini\` 完全排除済）
- **ZIPアーカイブ:** \`YDK_Smart_Seal_Chrome_Extension_v${VERSION}.zip\`
- **導入手順:**
  1. Chromeで \`chrome://extensions\` を開く
  2. 右上の「デベロッパーモード」をONにする
  3. 「パッケージ化されていない拡張機能を読み込む」をクリックし、ローカルの \`C:\\Users\\user\\YDK_スマート電子印鑑スタジオ_Chrome拡張版\`（または本パッケージ内の \`02_Chrome拡張機能版_MV3\\YDK_Smart_Seal_Chrome_Extension\`）を選択

### ③ \`03_AIエージェントCLI・スキル版\`
- **構成:** \`ydk_seal_cli.mjs\` / \`ydk_seal_renderer.py\` / \`ydk-seal.bat\` / \`SKILL.md\`
- **サンプル検証済PDF:** \`sample_legal_verified_invoice.pdf\`（会社公式実印スキャン＋日付データ印＋承認印＋電子署名法準拠4層証明データ＋巻末検証証明書シート付）
- **コマンド例:**
  \`\`\`powershell
  # プリセット一覧
  ydk-seal presets

  # 請求書PDFへの自動位置検出押印＋電子署名法準拠証明データ組込＋検証証明書ページ追加
  ydk-seal stamp --pdf invoice.pdf --out invoice_捺印済.pdf --preset preset-ydk-official-scan --anchor "印|株式会社YDK" --cert-page --save-drive

  # 押印済みPDFの暗号署名・非改変証明の検証
  ydk-seal verify --pdf invoice_捺印済.pdf

  # 電磁的監査台帳（省令第9条・10年保存互換 JSONL）の確認
  ydk-seal ledger --limit 20
  \`\`\`

### ④ \`04_電子署名法準拠_仕様書・取扱説明書\`
- **準拠法令（全6文書）:**
  1. 電子署名及び認証業務に関する法律（平成12年法律第102号 / 改正令和7年6月1日施行）第2条第1項・第3条・第13条第2項
  2. 電子署名及び認証業務に関する法律施行令（平成13年政令第41号）
  3. 電子署名及び認証業務に関する法律第十五条第三項に規定する書類の記載事項を定める省令（平成14年省令第1号）
  4. 電子署名及び認証業務に関する法律に基づく指定調査機関等に関する省令（平成13年省令第1号）第9条（10年電磁的帳簿保存互換）
  5. 電子署名及び認証業務に関する法律に基づく指定調査機関の調査に関する方針（令和7年6月30日デジタル庁・法務省通知）第4の4・第4の9
  6. 電子署名及び認証業務に関する法律に基づく特定認証業務の認定に係る指針（令和7年6月30日デジタル庁・法務省告示第4号）第3条（RSA-2048 OID \`1.2.840.113549.1.1.11\` / ECDSA-P256 OID \`1.2.840.10045.4.3.2\`）・第8条・第9条（ローマ字氏名 \`YUUKI ABE\`）・第10条（検証鍵SHA-256/384/512ハッシュ）・第11条・第12条
`;

const launcherBat = `@echo off
chcp 65001 > nul
echo ====================================================================
echo   💮 YDK スマート電子印鑑スタジオ v${VERSION} を起動しています...
echo ====================================================================
start "" "%~dp0YDK_スマート電子印鑑スタジオ_v${VERSION}.html"
`;

const releaseStageDir = path.join(projectDir, 'release', `YDK_スマート電子印鑑スタジオ_完成パッケージ_v${VERSION}`);
if (fs.existsSync(releaseStageDir)) {
  fs.rmSync(releaseStageDir, { recursive: true, force: true });
}

const dir01 = path.join(releaseStageDir, '01_Webアプリ単体完結版');
const dir02 = path.join(releaseStageDir, '02_Chrome拡張機能版_MV3');
const dir02Unpacked = path.join(dir02, 'YDK_Smart_Seal_Chrome_Extension');
const dir03 = path.join(releaseStageDir, '03_AIエージェントCLI・スキル版');
const dir04 = path.join(releaseStageDir, '04_電子署名法準拠_仕様書・取扱説明書');

fs.mkdirSync(dir01, { recursive: true });
fs.mkdirSync(dir02Unpacked, { recursive: true });
fs.mkdirSync(dir03, { recursive: true });
fs.mkdirSync(dir04, { recursive: true });

// 01: Single HTML + Launcher
fs.writeFileSync(path.join(dir01, `YDK_スマート電子印鑑スタジオ_v${VERSION}.html`), singleHtml, 'utf8');
fs.writeFileSync(path.join(dir01, 'index.html'), singleHtml, 'utf8');
fs.writeFileSync(path.join(dir01, '起動_YDKスマート電子印鑑スタジオ.bat'), launcherBat, 'utf8');

// 02: Chrome Extension MV3 Unpacked
populateExtensionDir(dir02Unpacked);

// 03: Agent CLI & Skill
for (const f of ['ydk_seal_cli.mjs', 'ydk_seal_renderer.py', 'sample_legal_verified_invoice.pdf']) {
  const src = path.join(projectDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(dir03, f));
  }
}
if (fs.existsSync('C:\\Users\\user\\ydk-seal.bat')) {
  fs.copyFileSync('C:\\Users\\user\\ydk-seal.bat', path.join(dir03, 'ydk-seal.bat'));
}
if (fs.existsSync('C:\\Users\\user\\.agents\\skills\\ydk-smart-seal-studio\\SKILL.md')) {
  fs.copyFileSync(
    'C:\\Users\\user\\.agents\\skills\\ydk-smart-seal-studio\\SKILL.md',
    path.join(dir03, 'SKILL.md')
  );
}

// 04: Docs & Root README
fs.writeFileSync(path.join(dir04, 'README_取扱説明書_および_電子署名法準拠仕様書.md'), readmeContent, 'utf8');
fs.writeFileSync(path.join(releaseStageDir, 'README.md'), readmeContent, 'utf8');

// Chrome拡張ZIPと全体パッケージZIPを作成
const releaseRoot = path.join(projectDir, 'release');
const extZipPath = path.join(releaseRoot, `YDK_Smart_Seal_Chrome_Extension_v${VERSION}.zip`);
const fullZipPath = path.join(releaseRoot, `YDK_Smart_Seal_Studio_v${VERSION}_Complete_Package.zip`);

if (fs.existsSync(extZipPath)) fs.unlinkSync(extZipPath);
if (fs.existsSync(fullZipPath)) fs.unlinkSync(fullZipPath);

execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${dir02Unpacked}\\*' -DestinationPath '${extZipPath}' -Force"`
);
fs.copyFileSync(extZipPath, path.join(dir02, `YDK_Smart_Seal_Chrome_Extension_v${VERSION}.zip`));

execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${releaseStageDir}\\*' -DestinationPath '${fullZipPath}' -Force"`
);

// マイドライブ・YDK_System_Root・デスクトップへ完成パッケージを配布
const packageDestinations = [
  `C:\\Users\\user\\マイドライブ\\YDK_スマート電子印鑑スタジオ_完成パッケージ_v${VERSION}`,
  `C:\\Users\\user\\マイドライブ\\YDK_System_Root\\03_MicroApps\\YDK_Smart_Seal_Studio_Release_v${VERSION}`,
];

for (const dest of packageDestinations) {
  fs.mkdirSync(dest, { recursive: true });
  execSync(`powershell -NoProfile -Command "Copy-Item -Path '${releaseStageDir}\\*' -Destination '${dest}' -Recurse -Force"`);
  removeIllegalExtensionFiles(path.join(dest, '02_Chrome拡張機能版_MV3', 'YDK_Smart_Seal_Chrome_Extension'));
  console.log('[Complete Package Synced]', dest);
}

const driveZipDest = `C:\\Users\\user\\マイドライブ\\YDK_スマート電子印鑑スタジオ_v${VERSION}_Complete_Package.zip`;
fs.copyFileSync(fullZipPath, driveZipDest);
console.log('[Complete ZIP Saved]', fullZipPath);
console.log('[Complete ZIP Saved to Drive]', driveZipDest);

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

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
let singleHtml = htmlTemplate
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
// MV3 の CSP (script-src 'self') 準拠のため外部JS/CSS構成（相対パス）で出力
// ※ Googleドライブ同期フォルダは自動的に隠しファイル desktop.ini を生成し Chrome拡張読込エラーの原因となるため、
//   ローカル直下 (C:\Users\user\YDK_スマート電子印鑑スタジオ_Chrome拡張版) とマイドライブの両方に出力し、desktop.ini を完全除去する。
const extDirs = [
  'C:\\Users\\user\\YDK_スマート電子印鑑スタジオ_Chrome拡張版',
  'C:\\Users\\user\\マイドライブ\\YDK_スマート電子印鑑スタジオ_Chrome拡張版',
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

// Chrome拡張用 index.html (相対パス ./assets/ 参照 + フルタブ展開ボタン用スクリプト読み込み)
const extHtml = htmlTemplate
  .replace(/href="\/assets\//g, 'href="./assets/')
  .replace(/src="\/assets\//g, 'src="./assets/')
  .replace('</body>', '  <script src="./extension-helper.js"></script>\n  </body>');

// Chrome拡張用 extension-helper.js (サイドパネル内からフル画面タブで開くフローティングボタン等を追加)
const extHelperJs = `// YDK スマート電子印鑑スタジオ Chrome拡張ヘルパー
(function() {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    window.addEventListener('DOMContentLoaded', () => {
      const isSidePanel = window.innerWidth < 600;
      if (isSidePanel) {
        const bar = document.createElement('div');
        bar.style.cssText = 'background:#0f172a;color:#fff;padding:6px 10px;display:flex;justify-content:space-between;align-items:center;font-size:12px;border-bottom:1px solid #334155;';
        bar.innerHTML = '<span>🧩 Chromeサイドパネルモード</span><button id="ydk-open-full-tab" style="background:#3b82f6;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:bold;cursor:pointer;">🖥️ 大画面タブで開く</button>';
        document.body.prepend(bar);
        document.getElementById('ydk-open-full-tab')?.addEventListener('click', () => {
          chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
        });
      }
    });
  }
})();
`;

// Chrome拡張用 background.js (Service Worker)
const backgroundJs = `/**
 * YDK スマート電子印鑑スタジオ - Chrome Extension Service Worker (Manifest V3)
 * - ツールバーアイコンクリックでサイドパネル即時起動
 * - 右クリックコンテキストメニューから「サイドパネル起動」「大画面フルタブ起動」をサポート
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

// Chrome拡張用 manifest.json (Manifest V3)
const manifestJson = {
  manifest_version: 3,
  name: 'YDK スマート電子印鑑スタジオ (YDK Smart Seal Studio)',
  short_name: 'YDK電子印鑑',
  version: '1.0.0',
  description:
    '代表者印・会社角印・認印・日付データ印を高精細透過生成し、PDFプレビュー上で直感的に押印・Googleドライブ保存できるYDK謹製Chrome拡張機能。',
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

// 純粋Node.jsで朱色丸印アイコンPNG (16x16, 48x48, 128x128) を生成
function createSealIconPng(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const outerR = size * 0.45;
  const innerR = size * 0.34;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist <= outerR) {
        // 朱色背景または白抜き印影模様
        const isRing = dist >= innerR && dist <= outerR;
        const isCrossBar =
          dist < innerR * 0.85 &&
          (Math.abs(x - cx) <= Math.max(1, size * 0.08) ||
            Math.abs(y - cy) <= Math.max(1, size * 0.08));
        if (isRing || isCrossBar) {
          raw[px] = 216; // R (#d80016)
          raw[px + 1] = 0; // G
          raw[px + 2] = 22; // B
          raw[px + 3] = 255; // A
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
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

for (const extDir of extDirs) {
  const extAssetsDir = path.join(extDir, 'assets');
  const extIconsDir = path.join(extDir, 'icons');
  fs.mkdirSync(extAssetsDir, { recursive: true });
  fs.mkdirSync(extIconsDir, { recursive: true });

  // Copy CSS and JS assets
  fs.copyFileSync(path.join(assetsDir, cssFile), path.join(extAssetsDir, cssFile));
  fs.copyFileSync(path.join(assetsDir, jsFile), path.join(extAssetsDir, jsFile));

  // Write index.html, extension-helper.js, background.js, manifest.json
  fs.writeFileSync(path.join(extDir, 'index.html'), extHtml, 'utf8');
  fs.writeFileSync(path.join(extDir, 'extension-helper.js'), extHelperJs, 'utf8');
  fs.writeFileSync(path.join(extDir, 'background.js'), backgroundJs, 'utf8');
  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifestJson, null, 2), 'utf8');

  for (const sz of [16, 48, 128]) {
    fs.writeFileSync(path.join(extIconsDir, `icon${sz}.png`), iconBuffers[sz]);
  }

  // Strip desktop.ini / Thumbs.db / .DS_Store recursively
  removeIllegalExtensionFiles(extDir);
  console.log('[Chrome Extension MV3 Saved & Cleaned]', extDir);
}


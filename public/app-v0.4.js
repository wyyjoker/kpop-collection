const pwaState = {
  deferredPrompt: null,
  reloading: false,
};

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isSafari() {
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);
}

function ensurePwaHead() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = '/manifest.webmanifest';
    document.head.append(manifest);
  }

  const metaEntries = [
    ['apple-mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
    ['apple-mobile-web-app-title', 'K-pop Collection'],
    ['mobile-web-app-capable', 'yes'],
  ];
  for (const [name, content] of metaEntries) {
    if (document.querySelector(`meta[name="${name}"]`)) continue;
    const meta = document.createElement('meta');
    meta.name = name;
    meta.content = content;
    document.head.append(meta);
  }

  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'apple-touch-icon';
    icon.sizes = '180x180';
    icon.href = '/icons/apple-touch-icon.png';
    document.head.append(icon);
  }
}

function ensurePwaUi() {
  const topbar = document.querySelector('.topbar');
  if (topbar && !document.querySelector('#pwaInstallButton')) {
    topbar.insertAdjacentHTML('beforeend', '<button id="pwaInstallButton" class="pwa-install-button hidden" type="button" aria-label="安装到主屏幕">⇩ <span>安装 App</span></button>');
  }

  if (!document.querySelector('#pwaNetworkBanner')) {
    document.body.insertAdjacentHTML('afterbegin', '<div id="pwaNetworkBanner" class="pwa-network-banner" role="status" aria-live="polite">当前离线 · 可以浏览应用外壳，收藏数据需要联网</div>');
  }

  if (!document.querySelector('#pwaInstallDialog')) {
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="pwaInstallDialog" class="pwa-install-dialog">
        <div class="pwa-install-sheet">
          <div class="pwa-app-icon">K</div>
          <div>
            <p class="eyebrow">ADD TO HOME SCREEN</p>
            <h2>安装 K-pop Collection</h2>
            <p id="pwaInstallCopy">把收藏馆添加到手机桌面，以独立 App 窗口打开。</p>
          </div>
          <ol id="pwaInstallSteps"></ol>
          <button id="pwaInstallConfirm" class="primary-button full" type="button">安装</button>
          <button id="pwaInstallClose" class="secondary-button full" type="button">稍后</button>
        </div>
      </dialog>
    `);
  }
}

function syncStandaloneState() {
  const standalone = isStandalone();
  document.documentElement.classList.toggle('pwa-standalone', standalone);
  const button = document.querySelector('#pwaInstallButton');
  if (!button) return;

  const installAvailable = Boolean(pwaState.deferredPrompt) || (isIOS() && isSafari());
  button.classList.toggle('hidden', standalone || !installAvailable);
}

function syncNetworkState() {
  document.documentElement.classList.toggle('pwa-offline', !navigator.onLine);
  const banner = document.querySelector('#pwaNetworkBanner');
  if (banner) banner.classList.toggle('show', !navigator.onLine);
}

function openInstallDialog() {
  const dialog = document.querySelector('#pwaInstallDialog');
  const steps = document.querySelector('#pwaInstallSteps');
  const confirm = document.querySelector('#pwaInstallConfirm');
  if (!dialog || !steps || !confirm) return;

  if (isIOS() && !pwaState.deferredPrompt) {
    steps.innerHTML = '<li>在 Safari 底部点“分享”按钮。</li><li>向下找到“添加到主屏幕”。</li><li>点击右上角“添加”。</li>';
    confirm.textContent = '知道了';
  } else {
    steps.innerHTML = '<li>点击下面的“安装”。</li><li>浏览器确认后，应用会出现在桌面或应用列表。</li>';
    confirm.textContent = '安装';
  }

  if (typeof dialog.showModal === 'function') dialog.showModal();
}

async function requestInstall() {
  const dialog = document.querySelector('#pwaInstallDialog');
  if (!pwaState.deferredPrompt) {
    dialog?.close();
    return;
  }

  pwaState.deferredPrompt.prompt();
  await pwaState.deferredPrompt.userChoice;
  pwaState.deferredPrompt = null;
  dialog?.close();
  syncStandaloneState();
}

function bindPwaEvents() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pwaState.deferredPrompt = event;
    syncStandaloneState();
  });

  window.addEventListener('appinstalled', () => {
    pwaState.deferredPrompt = null;
    syncStandaloneState();
  });

  window.addEventListener('online', syncNetworkState);
  window.addEventListener('offline', syncNetworkState);
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', syncStandaloneState);

  document.addEventListener('click', (event) => {
    if (event.target.closest('#pwaInstallButton')) openInstallDialog();
    if (event.target.closest('#pwaInstallClose')) document.querySelector('#pwaInstallDialog')?.close();
    if (event.target.closest('#pwaInstallConfirm')) requestInstall();
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    registration.update().catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (pwaState.reloading) return;
      pwaState.reloading = true;
      window.location.reload();
    });
  } catch (error) {
    console.warn('PWA service worker registration failed:', error);
  }
}

function applyPwaShortcut() {
  const params = new URLSearchParams(location.search);
  if (params.get('view') !== 'collection') return;
  const tab = params.get('tab');
  if (!tab) return;
  setTimeout(() => document.querySelector(`[data-v3-tab="${CSS.escape(tab)}"]`)?.click(), 100);
}

ensurePwaHead();
ensurePwaUi();
bindPwaEvents();
syncStandaloneState();
syncNetworkState();
registerServiceWorker();
applyPwaShortcut();

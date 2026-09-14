import { request } from './api.js';
import { store } from './store.js';

const dialog = document.querySelector('#editorDialog');
let busy = false;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function syncSection() {
  return `<section class="backup-section catalog-sync-section" data-catalog-panel>
    <h3>云端团体资料库</h3>
    <p>把 14 个团的实体 Album / EP / Single、Tracklist、封面、实体版本和已核实 Barcode 同步到 Sites / D1。已有收藏状态、数量、备注和你的自定义版本资料不会被重置。</p>
    <div class="catalog-sync-summary" data-catalog-summary>正在读取云端同步状态…</div>
    <div class="catalog-sync-list" data-catalog-list></div>
    <p class="form-hint">资料来自 MusicBrainz + Cover Art Archive。同步按团逐个执行；未核实 Barcode 保持为空。商业音频和歌词不会被复制。</p>
    <div class="button-row">
      <button class="pink-button" type="button" data-catalog-sync="missing">同步缺少的团体</button>
      <button class="soft-button" type="button" data-catalog-sync="force">重新检查全部 14 团</button>
    </div>
    <p class="catalog-sync-progress" data-catalog-progress role="status" aria-live="polite"></p>
  </section>`;
}

function renderStatus(panel, data) {
  const artists = data.artists || [];
  const synced = artists.filter(item => item.synced).length;
  panel.querySelector('[data-catalog-summary]').innerHTML = `<strong>${synced} / ${artists.length}</strong> 个团体已写入当前云端资料库`;
  panel.querySelector('[data-catalog-list]').innerHTML = artists.map(item => `<div class="catalog-sync-item ${item.synced ? 'synced' : ''}">
    <span>${item.synced ? '✓' : '○'}</span>
    <b>${escapeHtml(item.name)}</b>
    <small>${item.synced ? `${item.albums} 张发行 · ${item.versions} 个实体版本` : '等待同步'}</small>
  </div>`).join('');
}

async function refreshStatus(panel) {
  try {
    const data = await request('/api/catalog/status');
    renderStatus(panel, data);
    return data;
  } catch (error) {
    panel.querySelector('[data-catalog-summary]').textContent = `读取失败：${error.message}`;
    return null;
  }
}

function injectPanel() {
  if (!dialog?.open || store.runtime !== 'sites' || !store.can_edit || dialog.querySelector('[data-catalog-panel]')) return;
  const backupSections = dialog.querySelectorAll('.backup-section');
  if (!backupSections.length) return;
  backupSections[0].insertAdjacentHTML('afterend', syncSection());
  refreshStatus(dialog.querySelector('[data-catalog-panel]'));
}

new MutationObserver(injectPanel).observe(dialog, { childList: true, subtree: true });
document.addEventListener('click', event => {
  if (event.target.closest('[data-action="backup"]')) queueMicrotask(injectPanel);
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-catalog-sync]');
  if (!button || busy) return;
  const panel = button.closest('[data-catalog-panel]');
  if (!panel || store.runtime !== 'sites' || !store.can_edit) return;
  busy = true;
  const buttons = [...panel.querySelectorAll('[data-catalog-sync]')];
  buttons.forEach(item => { item.disabled = true; });
  const progress = panel.querySelector('[data-catalog-progress]');
  try {
    const force = button.dataset.catalogSync === 'force';
    const status = await refreshStatus(panel);
    if (!status) return;
    const targets = force ? status.artists : status.artists.filter(item => !item.synced);
    if (!targets.length) {
      progress.textContent = '14 个团体已经同步完成。如需检查新发行，可使用“重新检查全部 14 团”。';
      return;
    }
    const failures = [];
    for (let index = 0; index < targets.length; index += 1) {
      const artist = targets[index];
      progress.textContent = `正在同步 ${index + 1} / ${targets.length}：${artist.name}…`;
      try {
        await request(`/api/catalog/sync/${encodeURIComponent(artist.slug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force }),
        });
      } catch (error) {
        failures.push(`${artist.name}: ${error.message}`);
      }
      await refreshStatus(panel);
    }
    progress.textContent = failures.length ? `同步结束，${failures.length} 个团体需要重试：${failures.join('；')}` : '云端资料库同步完成 ✓ 正在刷新收藏页面…';
    if (!failures.length) setTimeout(() => location.reload(), 700);
  } finally {
    busy = false;
    buttons.forEach(item => { item.disabled = false; });
  }
});

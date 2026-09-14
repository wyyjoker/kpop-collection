import { store, route } from './store.js';

function text(value) {
  return String(value ?? '').trim();
}

function chip(label, value, className = '') {
  if (!text(value)) return '';
  return `<span class="version-detail-chip ${className}"><small>${label}</small><b>${value}</b></span>`;
}

function enhanceVersionRows() {
  const r = route();
  if (r.view !== 'album') return;
  const album = store.albums.find((item) => item.id === Number(r.album));
  if (!album) return;
  const rows = [...document.querySelectorAll('.version-section .version-row')];
  rows.forEach((row, index) => {
    const version = album.versions?.[index];
    if (!version || row.dataset.versionEnhanced === '1') return;
    row.dataset.versionEnhanced = '1';
    row.dataset.versionId = String(version.id);
    const picture = row.querySelector('.picture');
    if (picture) {
      picture.classList.add('version-cover-art');
      if (version.cover && version.cover !== album.cover) picture.dataset.specificCover = '1';
    }
    const info = row.querySelector('div:first-of-type');
    if (!info) return;
    const legacy = info.querySelector('small');
    if (legacy) legacy.remove();
    const status = row.querySelector('.status-badge, .badge');
    const details = document.createElement('div');
    details.className = 'version-detail-grid';
    details.innerHTML = [
      chip('版本类型', version.edition_type || '实体版本'),
      chip('Barcode', version.barcode || '未核实', version.barcode ? 'has-barcode' : 'muted'),
      chip('数量', Number(version.quantity || 0)),
      chip('封面', version.cover && version.cover !== album.cover ? '独立版本封面' : '沿用专辑封面', version.cover && version.cover !== album.cover ? 'has-cover' : 'muted'),
    ].join('');
    if (status) info.insertBefore(details, status);
    else info.append(details);
  });
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    enhanceVersionRows();
  });
}

const target = document.querySelector('#pageContent');
if (target) new MutationObserver(schedule).observe(target, { childList: true, subtree: true });
window.addEventListener('popstate', schedule);
document.addEventListener('DOMContentLoaded', schedule);
schedule();

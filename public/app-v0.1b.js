const state = {
  groups: [],
  stats: {},
  currentGroupId: null,
  groupData: null,
  filters: { search: '', status: 'all', year: 'all', sort: 'date-desc' },
};

const els = {
  homeView: document.querySelector('#homeView'),
  groupView: document.querySelector('#groupView'),
  backButton: document.querySelector('#backButton'),
  brandHome: document.querySelector('#brandHome'),
  primaryAction: document.querySelector('#primaryAction'),
  statGroups: document.querySelector('#statGroups'),
  statAlbums: document.querySelector('#statAlbums'),
  statVersions: document.querySelector('#statVersions'),
  statOwned: document.querySelector('#statOwned'),
  heroCompletion: document.querySelector('#heroCompletion'),
  groupSearch: document.querySelector('#groupSearch'),
  groupGrid: document.querySelector('#groupGrid'),
  groupCountLabel: document.querySelector('#groupCountLabel'),
  homeEmpty: document.querySelector('#homeEmpty'),
  groupHero: document.querySelector('#groupHero'),
  albumSearch: document.querySelector('#albumSearch'),
  statusFilter: document.querySelector('#statusFilter'),
  yearFilter: document.querySelector('#yearFilter'),
  sortFilter: document.querySelector('#sortFilter'),
  albumList: document.querySelector('#albumList'),
  albumEmpty: document.querySelector('#albumEmpty'),
  groupDialog: document.querySelector('#groupDialog'),
  albumDialog: document.querySelector('#albumDialog'),
  versionDialog: document.querySelector('#versionDialog'),
  groupForm: document.querySelector('#groupForm'),
  albumForm: document.querySelector('#albumForm'),
  versionForm: document.querySelector('#versionForm'),
  toast: document.querySelector('#toast'),
};

function ensureUi() {
  for (const [form, name] of [[els.groupForm, 'entity_id'], [els.albumForm, 'entity_id']]) {
    if (!form.elements[name]) form.insertAdjacentHTML('afterbegin', `<input name="${name}" type="hidden">`);
  }

  const backupButton = document.createElement('button');
  backupButton.id = 'backupButton';
  backupButton.className = 'secondary-button topbar-backup';
  backupButton.type = 'button';
  backupButton.textContent = '备份';
  els.primaryAction.before(backupButton);

  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="versionDetailDialog" class="wide-dialog">
      <form id="versionDetailForm" class="dialog-form">
        <div class="dialog-heading">
          <div><p class="eyebrow">VERSION DETAIL</p><h2>版本与购买详情</h2></div>
          <button class="icon-button" type="button" data-close-dialog>×</button>
        </div>
        <input name="version_id" type="hidden">
        <div class="detail-section-title">版本信息</div>
        <label>版本名称<input name="version_name" required></label>
        <div class="two-columns">
          <label>版本类型<input name="edition_type" placeholder="Photobook / Digipack"></label>
          <label>条码<input name="barcode" inputmode="numeric"></label>
        </div>
        <label>替换版本封面<input name="cover_file" type="file" accept="image/*"></label>

        <div class="detail-section-title">收藏与购买</div>
        <div class="two-columns">
          <label>收藏状态
            <select name="status">
              <option value="owned">已拥有</option>
              <option value="missing">缺少</option>
              <option value="wishlist">Wishlist</option>
              <option value="preordered">已预购</option>
            </select>
          </label>
          <label>数量<input name="quantity" type="number" min="0" step="1" value="0"></label>
        </div>
        <div class="two-columns">
          <label>购买日期<input name="purchase_date" type="date"></label>
          <label>购买渠道<input name="purchase_channel" placeholder="Ktown4u / 淘宝 / 线下"></label>
        </div>
        <div class="two-columns">
          <label>购买价格<input name="purchase_price" type="number" min="0" step="0.01" placeholder="128"></label>
          <label>货币
            <select name="purchase_currency">
              <option value="CNY">CNY ¥</option>
              <option value="KRW">KRW ₩</option>
              <option value="USD">USD $</option>
              <option value="JPY">JPY ¥</option>
              <option value="SGD">SGD $</option>
            </select>
          </label>
        </div>
        <label class="checkbox-label"><input name="opened" type="checkbox"> 已拆封</label>
        <label>备注<textarea name="notes" rows="3" placeholder="特典、店铺、缺件情况等"></textarea></label>
        <div class="dialog-actions">
          <button class="danger-button" type="button" id="deleteVersionInDialog">删除版本</button>
          <button class="primary-button" type="submit">保存详情</button>
        </div>
      </form>
    </dialog>

    <dialog id="backupDialog" class="wide-dialog">
      <div class="dialog-form">
        <div class="dialog-heading">
          <div><p class="eyebrow">BACKUP & RESTORE</p><h2>备份与恢复</h2></div>
          <button class="icon-button" type="button" data-close-dialog>×</button>
        </div>
        <section class="backup-panel">
          <h3>导出备份</h3>
          <p class="muted">JSON 和 SQLite 都保存收藏数据。上传的封面图片仍保存在 public/uploads，跨电脑迁移时请同时备份该目录。</p>
          <div class="backup-actions">
            <button id="exportJsonButton" class="secondary-button" type="button">下载 JSON</button>
            <button id="exportDbButton" class="secondary-button" type="button">下载 SQLite</button>
          </div>
        </section>
        <section class="backup-panel danger-zone">
          <h3>恢复备份</h3>
          <p class="muted">恢复会覆盖当前收藏数据，请先导出一份当前备份。</p>
          <label>恢复 JSON<input id="importJsonFile" type="file" accept="application/json,.json"></label>
          <button id="importJsonButton" class="danger-button" type="button">恢复 JSON</button>
          <label>恢复 SQLite<input id="restoreDbFile" type="file" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3"></label>
          <button id="restoreDbButton" class="danger-button" type="button">恢复 SQLite</button>
        </section>
      </div>
    </dialog>
  `);

  els.versionDetailDialog = document.querySelector('#versionDetailDialog');
  els.versionDetailForm = document.querySelector('#versionDetailForm');
  els.backupDialog = document.querySelector('#backupDialog');
  els.backupButton = backupButton;
  els.deleteVersionInDialog = document.querySelector('#deleteVersionInDialog');
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || `Request failed: ${response.status}`);
  return payload;
}

async function uploadImage(file) {
  if (!file || !file.name || !file.size) return '';
  const form = new FormData();
  form.append('image', file);
  const result = await request('/api/upload', { method: 'POST', body: form });
  return result.path;
}

function showToast(message, error = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('error', error);
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);
}

function coverMarkup(src, title, className) {
  if (src) return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy">`;
  const initial = escapeHtml((title || '?').trim().slice(0, 1).toUpperCase());
  const fallbackClass = className.includes('group') ? 'group-cover-fallback' : 'album-cover-fallback';
  return `<div class="${fallbackClass}" aria-hidden="true">${initial}</div>`;
}

function formatDate(date) {
  if (!date) return '发行日期未填写';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(parsed);
}

function statusLabel(status) {
  return ({ owned: '已拥有', missing: '缺少', wishlist: 'Wishlist', preordered: '已预购' })[status] || '缺少';
}

function openDialog(dialog) {
  const element = typeof dialog === 'string' ? document.getElementById(dialog) : dialog;
  if (element && !element.open) element.showModal();
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function showHome() {
  state.currentGroupId = null;
  state.groupData = null;
  els.homeView.classList.remove('hidden');
  els.groupView.classList.add('hidden');
  els.backButton.classList.add('hidden');
  els.primaryAction.textContent = '+ 添加团体';
  history.replaceState({}, '', '/');
}

function showGroupView() {
  els.homeView.classList.add('hidden');
  els.groupView.classList.remove('hidden');
  els.backButton.classList.remove('hidden');
  els.primaryAction.textContent = '+ 添加专辑';
}

async function loadHome() {
  const [groups, stats] = await Promise.all([request('/api/groups'), request('/api/stats')]);
  state.groups = groups;
  state.stats = stats;
  renderStats();
  renderGroups();
}

function renderStats() {
  els.statGroups.textContent = state.stats.groups || 0;
  els.statAlbums.textContent = state.stats.albums || 0;
  els.statVersions.textContent = state.stats.versions || 0;
  els.statOwned.textContent = state.stats.owned || 0;
  els.heroCompletion.textContent = `${state.stats.completion || 0}%`;
}

function renderGroups() {
  const keyword = els.groupSearch.value.trim().toLowerCase();
  const groups = state.groups.filter((group) => `${group.name} ${group.korean_name || ''} ${group.company || ''}`.toLowerCase().includes(keyword));
  els.groupCountLabel.textContent = `${groups.length} 个团体`;
  els.homeEmpty.classList.toggle('hidden', state.groups.length !== 0);
  els.groupGrid.classList.toggle('hidden', state.groups.length === 0);

  if (!state.groups.length) {
    els.groupGrid.innerHTML = '';
    return;
  }
  if (!groups.length) {
    els.groupGrid.innerHTML = '<div class="empty-state"><h3>没有匹配的团体</h3><p>换一个关键词试试。</p></div>';
    return;
  }

  els.groupGrid.innerHTML = groups.map((group) => `
    <article class="group-card" data-group-id="${group.id}" tabindex="0">
      ${coverMarkup(group.cover, group.name, 'group-cover')}
      <div class="group-overlay"></div>
      <div class="card-actions floating-actions">
        <button type="button" class="mini-button" data-edit-group="${group.id}" aria-label="编辑 ${escapeHtml(group.name)}">编辑</button>
        <button type="button" class="mini-button danger" data-delete-group="${group.id}" aria-label="删除 ${escapeHtml(group.name)}">删除</button>
      </div>
      <div class="group-card-content">
        <h3>${escapeHtml(group.name)}</h3>
        <div class="korean-name">${escapeHtml(group.korean_name || group.company || '')}</div>
        <div class="group-meta"><span>${group.album_count} Albums</span><span>${group.owned_count} / ${group.version_count} Owned</span></div>
        <div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:${group.completion}%"></div></div><strong>${group.completion}%</strong></div>
      </div>
    </article>
  `).join('');
}

async function openGroup(groupId) {
  state.currentGroupId = Number(groupId);
  state.groupData = await request(`/api/groups/${groupId}`);
  state.filters = { search: '', status: 'all', year: 'all', sort: 'date-desc' };
  els.albumSearch.value = '';
  els.statusFilter.value = 'all';
  els.sortFilter.value = 'date-desc';
  showGroupView();
  renderGroupHero();
  renderYearOptions();
  renderAlbums();
  history.replaceState({}, '', `/?group=${groupId}`);
}

function renderGroupHero() {
  const { group, summary } = state.groupData;
  els.groupHero.className = `group-hero${group.cover ? ' has-image' : ''}`;
  els.groupHero.setAttribute('style', group.cover ? `background-image:url("${group.cover.replace(/"/g, '%22')}")` : '');
  els.groupHero.innerHTML = `
    <div class="group-hero-content">
      <p class="eyebrow">${escapeHtml(group.company || 'K-POP GROUP')}</p>
      <h1>${escapeHtml(group.name)}</h1>
      <div class="subname">${escapeHtml(group.korean_name || '')}</div>
      <div class="group-summary"><span>${summary.albums} Albums</span><span>${summary.versions} Versions</span><span>${summary.owned} Owned</span><span>${summary.completion}% Complete</span></div>
      <div class="hero-actions">
        <button type="button" class="secondary-button" data-edit-group="${group.id}">编辑团体</button>
        <button type="button" class="danger-button subtle" data-delete-group="${group.id}">删除团体</button>
      </div>
    </div>
  `;
}

function renderYearOptions() {
  const years = [...new Set(state.groupData.albums.map((album) => album.release_date?.slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  els.yearFilter.innerHTML = ['<option value="all">全部年份</option>', ...years.map((year) => `<option value="${year}">${year}</option>`)].join('');
  els.yearFilter.value = state.filters.year;
}

function albumMatchesStatus(album, status) {
  return status === 'all' || album.versions.some((version) => version.status === status);
}

function renderAlbums() {
  const keyword = state.filters.search.trim().toLowerCase();
  let albums = state.groupData.albums.filter((album) => {
    const searchMatch = `${album.name} ${album.korean_name || ''} ${album.album_type || ''}`.toLowerCase().includes(keyword);
    const yearMatch = state.filters.year === 'all' || album.release_date?.startsWith(state.filters.year);
    return searchMatch && yearMatch && albumMatchesStatus(album, state.filters.status);
  });

  albums = [...albums].sort((a, b) => {
    if (state.filters.sort === 'name-asc') return a.name.localeCompare(b.name);
    const aDate = a.release_date || (state.filters.sort === 'date-asc' ? '9999' : '');
    const bDate = b.release_date || (state.filters.sort === 'date-asc' ? '9999' : '');
    return state.filters.sort === 'date-asc' ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
  });

  els.albumEmpty.classList.toggle('hidden', state.groupData.albums.length !== 0);
  els.albumList.classList.toggle('hidden', state.groupData.albums.length === 0);
  if (!state.groupData.albums.length) {
    els.albumList.innerHTML = '';
    return;
  }
  if (!albums.length) {
    els.albumList.innerHTML = '<div class="empty-state"><h3>没有符合筛选条件的专辑</h3><p>调整年份、状态或搜索关键词后再看看。</p></div>';
    return;
  }

  els.albumList.innerHTML = albums.map((album) => {
    const versionMarkup = album.versions.length ? album.versions.map((version) => `
      <div class="version-pill version-row">
        <span class="status-dot ${escapeHtml(version.status)}"></span>
        <button type="button" class="version-name-button" data-version-detail="${version.id}">${escapeHtml(version.version_name)}</button>
        <select data-version-status="${version.id}" aria-label="${escapeHtml(version.version_name)} 收藏状态">
          ${['owned', 'missing', 'wishlist', 'preordered'].map((status) => `<option value="${status}" ${version.status === status ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}
        </select>
        <button type="button" class="mini-button" data-version-detail="${version.id}">详情</button>
        <button type="button" class="mini-button danger" data-delete-version="${version.id}">删除</button>
      </div>
    `).join('') : '<span class="muted">暂未添加版本</span>';

    return `
      <article class="album-card">
        <div class="album-art">${coverMarkup(album.cover, album.name, 'album-cover')}</div>
        <div class="album-content">
          <div class="album-heading">
            <div><h3>${escapeHtml(album.name)}</h3><p>${escapeHtml(album.album_type || 'Album')} · ${escapeHtml(formatDate(album.release_date))}</p></div>
            <div class="album-actions">
              <button class="mini-button" type="button" data-edit-album="${album.id}">编辑</button>
              <button class="mini-button danger" type="button" data-delete-album="${album.id}">删除</button>
              <button class="secondary-button" type="button" data-add-version="${album.id}">+ 版本</button>
            </div>
          </div>
          <div class="version-list">${versionMarkup}</div>
          <div class="album-progress">${album.owned_count} / ${album.version_count} versions · ${album.completion}%</div>
        </div>
      </article>
    `;
  }).join('');
}

function findGroup(groupId) {
  if (state.groupData?.group.id === Number(groupId)) return state.groupData.group;
  return state.groups.find((group) => group.id === Number(groupId));
}

function findAlbum(albumId) {
  return state.groupData?.albums.find((album) => album.id === Number(albumId));
}

function findVersion(versionId) {
  for (const album of state.groupData?.albums || []) {
    const version = album.versions.find((item) => item.id === Number(versionId));
    if (version) return { version, album };
  }
  return null;
}

function prepareGroupForm(group = null) {
  els.groupForm.reset();
  els.groupForm.elements.entity_id.value = group?.id || '';
  els.groupForm.elements.name.value = group?.name || '';
  els.groupForm.elements.korean_name.value = group?.korean_name || '';
  els.groupForm.elements.company.value = group?.company || '';
  els.groupForm.elements.debut_date.value = group?.debut_date || '';
  els.groupDialog.querySelector('h2').textContent = group ? '编辑团体' : '添加团体';
  els.groupDialog.querySelector('.eyebrow').textContent = group ? 'EDIT GROUP' : 'NEW GROUP';
  els.groupForm.querySelector('button[type="submit"]').textContent = group ? '保存修改' : '保存团体';
  openDialog(els.groupDialog);
}

function prepareAlbumForm(album = null) {
  els.albumForm.reset();
  els.albumForm.elements.entity_id.value = album?.id || '';
  els.albumForm.elements.name.value = album?.name || '';
  els.albumForm.elements.korean_name.value = album?.korean_name || '';
  els.albumForm.elements.release_date.value = album?.release_date || '';
  const albumType = album?.album_type || '';
  const typeSelect = els.albumForm.elements.album_type;
  if (albumType && ![...typeSelect.options].some((option) => option.value === albumType)) {
    typeSelect.add(new Option(albumType, albumType));
  }
  els.albumForm.elements.album_type.value = album?.album_type || '';
  els.albumForm.elements.notes.value = album?.notes || '';
  els.albumDialog.querySelector('h2').textContent = album ? '编辑专辑' : '添加专辑';
  els.albumDialog.querySelector('.eyebrow').textContent = album ? 'EDIT ALBUM' : 'NEW ALBUM';
  els.albumForm.querySelector('button[type="submit"]').textContent = album ? '保存修改' : '保存专辑';
  openDialog(els.albumDialog);
}

function prepareVersionAdd(albumId) {
  els.versionForm.reset();
  els.versionForm.elements.album_id.value = albumId;
  openDialog(els.versionDialog);
}

function prepareVersionDetail(versionId) {
  const found = findVersion(versionId);
  if (!found) return showToast('未找到版本', true);
  const { version } = found;
  const form = els.versionDetailForm;
  form.reset();
  form.elements.version_id.value = version.id;
  form.elements.version_name.value = version.version_name || '';
  form.elements.edition_type.value = version.edition_type || '';
  form.elements.barcode.value = version.barcode || '';
  form.elements.status.value = version.status || 'missing';
  form.elements.quantity.value = version.quantity || 0;
  form.elements.purchase_date.value = version.purchase_date || '';
  form.elements.purchase_price.value = version.purchase_price ?? '';
  form.elements.purchase_channel.value = version.purchase_channel || '';
  const currency = version.purchase_currency || 'CNY';
  if (![...form.elements.purchase_currency.options].some((option) => option.value === currency)) {
    form.elements.purchase_currency.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(currency)}">${escapeHtml(currency)}</option>`);
  }
  form.elements.purchase_currency.value = currency;
  form.elements.opened.checked = Boolean(version.opened);
  form.elements.notes.value = version.collection_notes || '';
  openDialog(els.versionDetailDialog);
}

async function refreshCurrentGroup() {
  if (state.currentGroupId) await openGroup(state.currentGroupId);
  await loadHome();
}

async function deleteGroup(groupId) {
  const group = findGroup(groupId);
  if (!group) return;
  if (!confirm(`确定删除「${group.name}」吗？\n该团体下的专辑、版本和收藏记录都会一起删除。`)) return;
  await request(`/api/groups/${groupId}`, { method: 'DELETE' });
  showToast('团体已删除');
  showHome();
  await loadHome();
}

async function deleteAlbum(albumId) {
  const album = findAlbum(albumId);
  if (!album) return;
  if (!confirm(`确定删除专辑「${album.name}」吗？\n该专辑下所有版本与收藏记录都会一起删除。`)) return;
  await request(`/api/albums/${albumId}`, { method: 'DELETE' });
  showToast('专辑已删除');
  await refreshCurrentGroup();
}

async function deleteVersion(versionId) {
  const found = findVersion(versionId);
  if (!found) return;
  if (!confirm(`确定删除版本「${found.version.version_name}」吗？`)) return;
  await request(`/api/versions/${versionId}`, { method: 'DELETE' });
  closeDialog(els.versionDetailDialog);
  showToast('版本已删除');
  await refreshCurrentGroup();
}

async function submitWithBusy(form, callback) {
  const button = form.querySelector('button[type="submit"]');
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = '保存中…';
  try { await callback(); } finally { button.disabled = false; button.textContent = oldText; }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function exportJson() {
  const response = await fetch('/api/export');
  if (!response.ok) throw new Error('JSON 导出失败');
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  downloadBlob(await response.blob(), match?.[1] || 'kpop-collection-backup.json');
}

async function restoreJson() {
  const file = document.querySelector('#importJsonFile').files[0];
  if (!file) throw new Error('请选择 JSON 备份文件');
  if (!confirm('恢复 JSON 会覆盖当前全部收藏数据，确定继续吗？')) return;
  let snapshot;
  try { snapshot = JSON.parse(await file.text()); } catch (_error) { throw new Error('JSON 文件格式无效'); }
  await request('/api/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot),
  });
  closeDialog(els.backupDialog);
  showHome();
  await loadHome();
  showToast('JSON 备份已恢复');
}

async function restoreDatabase() {
  const file = document.querySelector('#restoreDbFile').files[0];
  if (!file) throw new Error('请选择 SQLite 备份文件');
  if (!confirm('恢复 SQLite 会覆盖当前全部收藏数据，确定继续吗？')) return;
  const form = new FormData();
  form.append('database', file);
  await request('/api/backup/database/restore', { method: 'POST', body: form });
  closeDialog(els.backupDialog);
  showHome();
  await loadHome();
  showToast('SQLite 备份已恢复');
}

function bindEvents() {
  els.groupSearch.addEventListener('input', renderGroups);
  els.backButton.addEventListener('click', showHome);
  els.brandHome.addEventListener('click', showHome);
  els.brandHome.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') showHome(); });
  els.backupButton.addEventListener('click', () => openDialog(els.backupDialog));

  els.primaryAction.addEventListener('click', () => state.currentGroupId ? prepareAlbumForm() : prepareGroupForm());

  els.groupGrid.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-group]');
    if (edit) return prepareGroupForm(findGroup(edit.dataset.editGroup));
    const remove = event.target.closest('[data-delete-group]');
    if (remove) return deleteGroup(remove.dataset.deleteGroup).catch((error) => showToast(error.message, true));
    const card = event.target.closest('[data-group-id]');
    if (card) openGroup(card.dataset.groupId).catch((error) => showToast(error.message, true));
  });
  els.groupGrid.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('button,select,input')) return;
    const card = event.target.closest('[data-group-id]');
    if (card) openGroup(card.dataset.groupId).catch((error) => showToast(error.message, true));
  });

  els.albumSearch.addEventListener('input', () => { state.filters.search = els.albumSearch.value; renderAlbums(); });
  els.statusFilter.addEventListener('change', () => { state.filters.status = els.statusFilter.value; renderAlbums(); });
  els.yearFilter.addEventListener('change', () => { state.filters.year = els.yearFilter.value; renderAlbums(); });
  els.sortFilter.addEventListener('change', () => { state.filters.sort = els.sortFilter.value; renderAlbums(); });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-dialog]')) closeDialog(event.target.closest('dialog'));

    const opener = event.target.closest('[data-open-dialog]');
    if (opener) {
      if (opener.dataset.openDialog === 'groupDialog') prepareGroupForm();
      else if (opener.dataset.openDialog === 'albumDialog') prepareAlbumForm();
      else openDialog(opener.dataset.openDialog);
    }

    const editGroup = event.target.closest('[data-edit-group]');
    if (editGroup && !event.target.closest('#groupGrid')) prepareGroupForm(findGroup(editGroup.dataset.editGroup));
    const deleteGroupButton = event.target.closest('[data-delete-group]');
    if (deleteGroupButton && !event.target.closest('#groupGrid')) deleteGroup(deleteGroupButton.dataset.deleteGroup).catch((error) => showToast(error.message, true));

    const addVersion = event.target.closest('[data-add-version]');
    if (addVersion) prepareVersionAdd(addVersion.dataset.addVersion);
    const editAlbum = event.target.closest('[data-edit-album]');
    if (editAlbum) prepareAlbumForm(findAlbum(editAlbum.dataset.editAlbum));
    const deleteAlbumButton = event.target.closest('[data-delete-album]');
    if (deleteAlbumButton) deleteAlbum(deleteAlbumButton.dataset.deleteAlbum).catch((error) => showToast(error.message, true));
    const versionDetail = event.target.closest('[data-version-detail]');
    if (versionDetail) prepareVersionDetail(versionDetail.dataset.versionDetail);
    const deleteVersionButton = event.target.closest('[data-delete-version]');
    if (deleteVersionButton) deleteVersion(deleteVersionButton.dataset.deleteVersion).catch((error) => showToast(error.message, true));
  });

  els.albumList.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-version-status]');
    if (!select) return;
    const status = select.value;
    try {
      await request(`/api/collection/${select.dataset.versionStatus}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, quantity: status === 'owned' ? 1 : 0 }),
      });
      showToast(`已更新为：${statusLabel(status)}`);
      await refreshCurrentGroup();
    } catch (error) { showToast(error.message, true); }
  });

  els.groupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitWithBusy(els.groupForm, async () => {
      const data = new FormData(els.groupForm);
      const id = data.get('entity_id');
      const cover = await uploadImage(data.get('cover_file'));
      const payload = {
        name: data.get('name'), korean_name: data.get('korean_name'), company: data.get('company'), debut_date: data.get('debut_date'),
      };
      if (cover) payload.cover = cover;
      await request(id ? `/api/groups/${id}` : '/api/groups', {
        method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      closeDialog(els.groupDialog);
      showToast(id ? '团体已更新' : '团体已添加');
      if (id && state.currentGroupId === Number(id)) await openGroup(id);
      await loadHome();
    }).catch((error) => showToast(error.message, true));
  });

  els.albumForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitWithBusy(els.albumForm, async () => {
      const data = new FormData(els.albumForm);
      const id = data.get('entity_id');
      const cover = await uploadImage(data.get('cover_file'));
      const payload = {
        group_id: state.currentGroupId, name: data.get('name'), korean_name: data.get('korean_name'), release_date: data.get('release_date'),
        album_type: data.get('album_type'), notes: data.get('notes'),
      };
      if (cover) payload.cover = cover;
      await request(id ? `/api/albums/${id}` : '/api/albums', {
        method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      closeDialog(els.albumDialog);
      showToast(id ? '专辑已更新' : '专辑已添加');
      await refreshCurrentGroup();
    }).catch((error) => showToast(error.message, true));
  });

  els.versionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitWithBusy(els.versionForm, async () => {
      const data = new FormData(els.versionForm);
      const cover = await uploadImage(data.get('cover_file'));
      await request('/api/versions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: data.get('album_id'), version_name: data.get('version_name'), edition_type: data.get('edition_type'), barcode: data.get('barcode'), cover }),
      });
      closeDialog(els.versionDialog);
      showToast('版本已添加');
      await refreshCurrentGroup();
    }).catch((error) => showToast(error.message, true));
  });

  els.versionDetailForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitWithBusy(els.versionDetailForm, async () => {
      const data = new FormData(els.versionDetailForm);
      const id = data.get('version_id');
      const cover = await uploadImage(data.get('cover_file'));
      const versionPayload = { version_name: data.get('version_name'), edition_type: data.get('edition_type'), barcode: data.get('barcode') };
      if (cover) versionPayload.cover = cover;
      await request(`/api/versions/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(versionPayload),
      });
      await request(`/api/collection/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          status: data.get('status'), quantity: Number(data.get('quantity') || 0), purchase_date: data.get('purchase_date'),
          purchase_price: data.get('purchase_price'), purchase_channel: data.get('purchase_channel'), purchase_currency: data.get('purchase_currency'),
          opened: data.get('opened') === 'on', notes: data.get('notes'),
        }),
      });
      closeDialog(els.versionDetailDialog);
      showToast('版本详情已保存');
      await refreshCurrentGroup();
    }).catch((error) => showToast(error.message, true));
  });

  els.deleteVersionInDialog.addEventListener('click', () => {
    const id = els.versionDetailForm.elements.version_id.value;
    deleteVersion(id).catch((error) => showToast(error.message, true));
  });

  document.querySelector('#exportJsonButton').addEventListener('click', () => exportJson().then(() => showToast('JSON 备份已下载')).catch((error) => showToast(error.message, true)));
  document.querySelector('#exportDbButton').addEventListener('click', () => {
    window.location.href = '/api/backup/database';
    showToast('正在下载 SQLite 备份');
  });
  document.querySelector('#importJsonButton').addEventListener('click', () => restoreJson().catch((error) => showToast(error.message, true)));
  document.querySelector('#restoreDbButton').addEventListener('click', () => restoreDatabase().catch((error) => showToast(error.message, true)));

  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  }
}

async function boot() {
  ensureUi();
  bindEvents();
  try {
    await loadHome();
    const groupId = new URLSearchParams(location.search).get('group');
    if (groupId) await openGroup(groupId);
  } catch (error) {
    showToast(error.message, true);
    console.error(error);
  }
}

boot();

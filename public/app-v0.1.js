const state = {
  groups: [],
  stats: {},
  currentGroupId: null,
  groupData: null,
  filters: {
    search: '',
    status: 'all',
    year: 'all',
    sort: 'date-desc',
  },
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

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }
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
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2400);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}

function coverMarkup(src, title, className) {
  if (src) {
    return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy">`;
  }
  const initial = escapeHtml((title || '?').trim().slice(0, 1).toUpperCase());
  const fallbackClass = className.includes('group') ? 'group-cover-fallback' : 'album-cover-fallback';
  return `<div class="${fallbackClass}" aria-hidden="true">${initial}</div>`;
}

function formatDate(date) {
  if (!date) return '发行日期未填写';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed);
}

function statusLabel(status) {
  return ({
    owned: '已拥有',
    missing: '缺少',
    wishlist: 'Wishlist',
    preordered: '已预购',
  })[status] || '缺少';
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
  const [groups, stats] = await Promise.all([
    request('/api/groups'),
    request('/api/stats'),
  ]);

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
  const groups = state.groups.filter((group) => {
    const haystack = `${group.name} ${group.korean_name || ''} ${group.company || ''}`.toLowerCase();
    return haystack.includes(keyword);
  });

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
      <div class="group-card-content">
        <h3>${escapeHtml(group.name)}</h3>
        <div class="korean-name">${escapeHtml(group.korean_name || group.company || '')}</div>
        <div class="group-meta">
          <span>${group.album_count} Albums</span>
          <span>${group.owned_count} / ${group.version_count} Owned</span>
        </div>
        <div class="progress-row">
          <div class="progress-track"><div class="progress-fill" style="width:${group.completion}%"></div></div>
          <strong>${group.completion}%</strong>
        </div>
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
      <div class="group-summary">
        <span>${summary.albums} Albums</span>
        <span>${summary.versions} Versions</span>
        <span>${summary.owned} Owned</span>
        <span>${summary.completion}% Complete</span>
      </div>
    </div>
  `;
}

function renderYearOptions() {
  const years = [...new Set(
    state.groupData.albums
      .map((album) => album.release_date?.slice(0, 4))
      .filter(Boolean)
  )].sort((a, b) => b.localeCompare(a));

  els.yearFilter.innerHTML = [
    '<option value="all">全部年份</option>',
    ...years.map((year) => `<option value="${year}">${year}</option>`),
  ].join('');
  els.yearFilter.value = state.filters.year;
}

function albumMatchesStatus(album, status) {
  if (status === 'all') return true;
  return album.versions.some((version) => version.status === status);
}

function renderAlbums() {
  const keyword = state.filters.search.trim().toLowerCase();
  let albums = state.groupData.albums.filter((album) => {
    const searchMatch = `${album.name} ${album.korean_name || ''} ${album.album_type || ''}`
      .toLowerCase()
      .includes(keyword);
    const yearMatch = state.filters.year === 'all'
      || album.release_date?.startsWith(state.filters.year);
    const statusMatch = albumMatchesStatus(album, state.filters.status);
    return searchMatch && yearMatch && statusMatch;
  });

  albums = [...albums].sort((a, b) => {
    if (state.filters.sort === 'name-asc') return a.name.localeCompare(b.name);
    const aDate = a.release_date || (state.filters.sort === 'date-asc' ? '9999' : '');
    const bDate = b.release_date || (state.filters.sort === 'date-asc' ? '9999' : '');
    return state.filters.sort === 'date-asc'
      ? aDate.localeCompare(bDate)
      : bDate.localeCompare(aDate);
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
    const versionMarkup = album.versions.length
      ? album.versions.map((version) => `
          <div class="version-pill">
            <span class="status-dot ${escapeHtml(version.status)}"></span>
            <span>${escapeHtml(version.version_name)}</span>
            <select data-version-status="${version.id}" aria-label="${escapeHtml(version.version_name)} 收藏状态">
              ${['owned', 'missing', 'wishlist', 'preordered'].map((status) => `
                <option value="${status}" ${version.status === status ? 'selected' : ''}>${statusLabel(status)}</option>
              `).join('')}
            </select>
          </div>
        `).join('')
      : '<span class="muted">暂未添加版本</span>';

    return `
      <article class="album-card">
        <div class="album-art">
          ${coverMarkup(album.cover, album.name, 'album-cover')}
        </div>
        <div class="album-content">
          <div class="album-heading">
            <div>
              <h3>${escapeHtml(album.name)}</h3>
              <p>${escapeHtml(album.album_type || 'Album')} · ${escapeHtml(formatDate(album.release_date))}</p>
            </div>
            <button class="secondary-button" type="button" data-add-version="${album.id}">+ 版本</button>
          </div>
          <div class="version-list">${versionMarkup}</div>
          <div class="album-progress">${album.owned_count} / ${album.version_count} versions · ${album.completion}%</div>
        </div>
      </article>
    `;
  }).join('');
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog && !dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

async function submitWithBusy(form, callback) {
  const button = form.querySelector('button[type="submit"]');
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = '保存中…';
  try {
    await callback();
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}

els.groupSearch.addEventListener('input', renderGroups);

els.groupGrid.addEventListener('click', (event) => {
  const card = event.target.closest('[data-group-id]');
  if (card) openGroup(card.dataset.groupId).catch((error) => showToast(error.message, true));
});

els.groupGrid.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('[data-group-id]');
  if (card) openGroup(card.dataset.groupId).catch((error) => showToast(error.message, true));
});

els.backButton.addEventListener('click', showHome);
els.brandHome.addEventListener('click', showHome);
els.brandHome.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') showHome();
});

els.primaryAction.addEventListener('click', () => {
  openDialog(state.currentGroupId ? 'albumDialog' : 'groupDialog');
});

document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-open-dialog]');
  if (opener) openDialog(opener.dataset.openDialog);

  if (event.target.closest('[data-close-dialog]')) {
    closeDialog(event.target.closest('dialog'));
  }

  const addVersion = event.target.closest('[data-add-version]');
  if (addVersion) {
    els.versionForm.elements.album_id.value = addVersion.dataset.addVersion;
    openDialog('versionDialog');
  }
});

els.albumSearch.addEventListener('input', () => {
  state.filters.search = els.albumSearch.value;
  renderAlbums();
});

els.statusFilter.addEventListener('change', () => {
  state.filters.status = els.statusFilter.value;
  renderAlbums();
});

els.yearFilter.addEventListener('change', () => {
  state.filters.year = els.yearFilter.value;
  renderAlbums();
});

els.sortFilter.addEventListener('change', () => {
  state.filters.sort = els.sortFilter.value;
  renderAlbums();
});

els.albumList.addEventListener('change', async (event) => {
  const select = event.target.closest('[data-version-status]');
  if (!select) return;

  const versionId = select.dataset.versionStatus;
  const status = select.value;

  try {
    await request(`/api/collection/${versionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        quantity: status === 'owned' ? 1 : 0,
      }),
    });
    showToast(`已更新为：${statusLabel(status)}`);
    await openGroup(state.currentGroupId);
    await loadHome();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.groupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitWithBusy(els.groupForm, async () => {
    const data = new FormData(els.groupForm);
    const cover = await uploadImage(data.get('cover_file'));
    await request('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.get('name'),
        korean_name: data.get('korean_name'),
        company: data.get('company'),
        debut_date: data.get('debut_date'),
        cover,
      }),
    });
    els.groupForm.reset();
    closeDialog(els.groupDialog);
    showToast('团体已添加');
    await loadHome();
  }).catch((error) => showToast(error.message, true));
});

els.albumForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitWithBusy(els.albumForm, async () => {
    const data = new FormData(els.albumForm);
    const cover = await uploadImage(data.get('cover_file'));
    await request('/api/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_id: state.currentGroupId,
        name: data.get('name'),
        korean_name: data.get('korean_name'),
        release_date: data.get('release_date'),
        album_type: data.get('album_type'),
        notes: data.get('notes'),
        cover,
      }),
    });
    els.albumForm.reset();
    closeDialog(els.albumDialog);
    showToast('专辑已添加');
    await openGroup(state.currentGroupId);
    await loadHome();
  }).catch((error) => showToast(error.message, true));
});

els.versionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitWithBusy(els.versionForm, async () => {
    const data = new FormData(els.versionForm);
    const cover = await uploadImage(data.get('cover_file'));
    await request('/api/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        album_id: data.get('album_id'),
        version_name: data.get('version_name'),
        edition_type: data.get('edition_type'),
        barcode: data.get('barcode'),
        cover,
      }),
    });
    els.versionForm.reset();
    closeDialog(els.versionDialog);
    showToast('版本已添加');
    await openGroup(state.currentGroupId);
    await loadHome();
  }).catch((error) => showToast(error.message, true));
});

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

async function boot() {
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

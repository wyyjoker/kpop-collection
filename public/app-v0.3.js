const v3State = {
  groups: [],
  details: [],
  items: [],
  activeTab: ['wishlist', 'missing', 'groups', 'years', 'status'].includes(new URLSearchParams(location.search).get('tab'))
    ? new URLSearchParams(location.search).get('tab') : 'wishlist',
  search: '',
  groupId: 'all',
  loaded: false,
};

const v3Labels = { owned: '已拥有', missing: '缺少', wishlist: 'Wishlist', preordered: '已预购' };

function v3Escape(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);
}

async function v3Request(url, options = {}) {
  const response = await fetch(url, options);
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || `Request failed: ${response.status}`);
  return payload;
}

function v3Toast(message, error = false) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  clearTimeout(v3Toast.timer);
  v3Toast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function v3Cover(src, title) {
  if (src) return `<img src="${v3Escape(src)}" alt="${v3Escape(title)}" loading="lazy">`;
  return `<div class="v3-cover-fallback">${v3Escape((title || '?').trim().slice(0, 1).toUpperCase())}</div>`;
}

function ensureV3Ui() {
  const main = document.querySelector('main');
  if (!main || document.querySelector('#collectionCenterView')) return;

  main.insertAdjacentHTML('beforeend', `
    <section id="collectionCenterView" class="v3-center hidden">
      <div class="v3-center-header">
        <div>
          <button id="v3Back" class="v3-back" type="button">← 返回收藏馆</button>
          <p class="eyebrow">COLLECTION CENTER</p>
          <h1>收藏中心</h1>
          <p class="v3-lead">看看还缺什么、想买什么，以及不同团体和发行年份的收藏完成度。</p>
        </div>
        <button id="v3Refresh" class="secondary-button" type="button">刷新数据</button>
      </div>

      <section class="v3-overview" aria-label="收藏中心概览">
        <article><small>已拥有</small><strong id="v3OwnedCount">0</strong></article>
        <article><small>Wishlist</small><strong id="v3WishlistCount">0</strong></article>
        <article><small>缺少</small><strong id="v3MissingCount">0</strong></article>
        <article><small>完成度</small><strong id="v3Completion">0%</strong></article>
      </section>

      <div class="v3-tabs" role="tablist" aria-label="收藏中心分类">
        <button class="active" type="button" data-v3-tab="wishlist">♡ Wishlist</button>
        <button type="button" data-v3-tab="missing">○ 缺失版本</button>
        <button type="button" data-v3-tab="groups">▥ 团体完成度</button>
        <button type="button" data-v3-tab="years">▦ 年份完成度</button>
        <button type="button" data-v3-tab="status">◉ 状态分布</button>
      </div>

      <div class="v3-filters">
        <label class="search-box compact"><span>⌕</span><input id="v3Search" type="search" placeholder="搜索团体 / 专辑 / 版本…"></label>
        <select id="v3GroupFilter" aria-label="按团体筛选"><option value="all">全部团体</option></select>
      </div>

      <div id="v3Content" class="v3-content"></div>
    </section>
  `);

  const homeInsights = document.querySelector('#v2Insights');
  if (homeInsights && !document.querySelector('#v3CenterEntry')) {
    homeInsights.insertAdjacentHTML('afterend', `
      <button id="v3CenterEntry" class="v3-center-entry" type="button">
        <span><small>COLLECTION CENTER</small><strong>Wishlist 与收藏统计</strong></span>
        <span>查看全部 →</span>
      </button>
    `);
  }

  const mobileNav = document.querySelector('#v2BottomNav');
  if (mobileNav && !document.querySelector('[data-v3-nav="center"]')) {
    mobileNav.querySelector('[data-v2-nav="backup"]')?.insertAdjacentHTML('beforebegin', '<button type="button" data-v3-nav="center"><strong>▦</strong>收藏</button>');
  }
}

function flattenV3Data() {
  v3State.items = [];
  for (const detail of v3State.details) {
    for (const album of detail.albums || []) {
      for (const version of album.versions || []) {
        v3State.items.push({
          ...version,
          group_id: detail.group.id,
          group_name: detail.group.name,
          group_cover: detail.group.cover,
          album_id: album.id,
          album_name: album.name,
          album_cover: album.cover,
          release_date: album.release_date,
        });
      }
    }
  }
}

async function loadV3Data(force = false) {
  if (v3State.loaded && !force) return;
  const groups = await v3Request('/api/groups');
  const details = await Promise.all(groups.map((group) => v3Request(`/api/groups/${group.id}`)));
  v3State.groups = groups;
  v3State.details = details;
  flattenV3Data();
  v3State.loaded = true;
  renderV3Overview();
  renderV3GroupFilter();
  renderV3Content();
}

function renderV3Overview() {
  const total = v3State.items.length;
  const owned = v3State.items.filter((item) => item.status === 'owned').length;
  const wishlist = v3State.items.filter((item) => item.status === 'wishlist').length;
  const missing = v3State.items.filter((item) => item.status === 'missing').length;
  document.querySelector('#v3OwnedCount').textContent = owned;
  document.querySelector('#v3WishlistCount').textContent = wishlist;
  document.querySelector('#v3MissingCount').textContent = missing;
  document.querySelector('#v3Completion').textContent = `${total ? Math.round((owned / total) * 100) : 0}%`;
}

function renderV3GroupFilter() {
  const select = document.querySelector('#v3GroupFilter');
  if (!select) return;
  select.innerHTML = ['<option value="all">全部团体</option>', ...v3State.groups.map((group) => `<option value="${group.id}">${v3Escape(group.name)}</option>`)].join('');
  select.value = v3State.groupId;
}

function filteredV3Items(status) {
  const keyword = v3State.search.toLowerCase().trim();
  return v3State.items.filter((item) => {
    const statusMatch = !status || item.status === status;
    const groupMatch = v3State.groupId === 'all' || String(item.group_id) === String(v3State.groupId);
    const searchMatch = !keyword || `${item.group_name} ${item.album_name} ${item.version_name} ${item.edition_type || ''}`.toLowerCase().includes(keyword);
    return statusMatch && groupMatch && searchMatch;
  });
}

function versionCards(items, emptyText) {
  if (!items.length) return `<div class="v3-empty"><strong>${emptyText}</strong><span>当前筛选条件下没有记录。</span></div>`;
  return `<div class="v3-item-grid">${items.map((item) => `
    <article class="v3-version-card">
      <div class="v3-version-cover">${v3Cover(item.cover || item.album_cover, item.album_name)}</div>
      <div class="v3-version-copy">
        <small>${v3Escape(item.group_name)}</small>
        <h3>${v3Escape(item.album_name)}</h3>
        <p>${v3Escape(item.version_name)}${item.edition_type ? ` · ${v3Escape(item.edition_type)}` : ''}</p>
        <div class="v3-card-actions">
          <span class="v3-status ${v3Escape(item.status)}">${v3Labels[item.status] || item.status}</span>
          <button type="button" data-v3-owned="${item.id}">✓ 标记已拥有</button>
        </div>
      </div>
    </article>
  `).join('')}</div>`;
}

function renderGroupRanking() {
  const keyword = v3State.search.toLowerCase().trim();
  let groups = v3State.groups.filter((group) => {
    const groupMatch = v3State.groupId === 'all' || String(group.id) === String(v3State.groupId);
    return groupMatch && (!keyword || `${group.name} ${group.korean_name || ''}`.toLowerCase().includes(keyword));
  });
  groups = [...groups].sort((a, b) => b.completion - a.completion || b.owned_count - a.owned_count);
  if (!groups.length) return '<div class="v3-empty"><strong>没有团体数据</strong><span>调整筛选条件后再看看。</span></div>';
  return `<div class="v3-ranking">${groups.map((group, index) => `
    <article class="v3-rank-row">
      <div class="v3-rank-number">${index + 1}</div>
      <div class="v3-rank-cover">${v3Cover(group.cover, group.name)}</div>
      <div class="v3-rank-main">
        <div><strong>${v3Escape(group.name)}</strong><span>${group.owned_count} / ${group.version_count} Versions</span></div>
        <div class="v3-rank-track"><i style="width:${group.completion}%"></i></div>
      </div>
      <b>${group.completion}%</b>
    </article>
  `).join('')}</div>`;
}

function renderYearProgress() {
  const items = filteredV3Items();
  const years = new Map();
  for (const item of items) {
    const year = item.release_date?.slice(0, 4) || '未注明年份';
    const entry = years.get(year) || { total: 0, owned: 0, wishlist: 0, missing: 0, preordered: 0 };
    entry.total += 1;
    if (entry[item.status] !== undefined) entry[item.status] += 1;
    years.set(year, entry);
  }
  const rows = [...years.entries()].sort((a, b) => {
    if (a[0] === '未注明年份') return 1;
    if (b[0] === '未注明年份') return -1;
    return b[0].localeCompare(a[0]);
  });
  if (!rows.length) return '<div class="v3-empty"><strong>没有年份数据</strong><span>录入专辑发行日期后，这里会按发行年份统计收藏完成度。</span></div>';
  return `<div class="v3-year-list">${rows.map(([year, stat]) => {
    const completion = stat.total ? Math.round((stat.owned / stat.total) * 100) : 0;
    return `<article class="v3-year-row">
      <div><strong>${v3Escape(year)}</strong><span>${stat.owned} / ${stat.total} Versions</span></div>
      <div class="v3-year-progress"><i style="width:${completion}%"></i></div>
      <div class="v3-year-meta"><span>Wishlist ${stat.wishlist}</span><span>缺少 ${stat.missing}</span><b>${completion}%</b></div>
    </article>`;
  }).join('')}</div>`;
}

function renderStatusDistribution() {
  const items = filteredV3Items();
  const total = items.length;
  const statuses = ['owned', 'wishlist', 'preordered', 'missing'];
  if (!total) return '<div class="v3-empty"><strong>没有收藏数据</strong><span>录入版本后这里会显示收藏状态分布。</span></div>';
  return `<div class="v3-status-board">${statuses.map((status) => {
    const count = items.filter((item) => item.status === status).length;
    const percent = Math.round((count / total) * 100);
    return `<article class="v3-status-stat ${status}">
      <div><span>${v3Labels[status]}</span><strong>${count}</strong></div>
      <div class="v3-status-track"><i style="width:${percent}%"></i></div>
      <small>${percent}%</small>
    </article>`;
  }).join('')}</div>`;
}

function renderV3Content() {
  const content = document.querySelector('#v3Content');
  if (!content) return;
  document.querySelectorAll('[data-v3-tab]').forEach((button) => button.classList.toggle('active', button.dataset.v3Tab === v3State.activeTab));
  if (v3State.activeTab === 'wishlist') content.innerHTML = versionCards(filteredV3Items('wishlist'), 'Wishlist 目前是空的');
  if (v3State.activeTab === 'missing') content.innerHTML = versionCards(filteredV3Items('missing'), '没有缺失版本');
  if (v3State.activeTab === 'groups') content.innerHTML = renderGroupRanking();
  if (v3State.activeTab === 'years') content.innerHTML = renderYearProgress();
  if (v3State.activeTab === 'status') content.innerHTML = renderStatusDistribution();
}

function showV3Center() {
  document.querySelector('#homeView')?.classList.add('hidden');
  document.querySelector('#groupView')?.classList.add('hidden');
  document.querySelector('#collectionCenterView')?.classList.remove('hidden');
  document.querySelector('#backButton')?.classList.add('hidden');
  document.querySelector('#primaryAction')?.classList.add('v3-hidden-action');
  document.querySelectorAll('[data-v2-nav], [data-v3-nav]').forEach((button) => button.classList.remove('active'));
  document.querySelector('[data-v3-nav="center"]')?.classList.add('active');
  history.replaceState({}, '', `/?view=collection&tab=${v3State.activeTab}`);
  loadV3Data(true).catch((error) => v3Toast(error.message, true));
}

async function markV3Owned(versionId) {
  await v3Request(`/api/collection/${versionId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'owned', quantity: 1 }),
  });
  v3Toast('已标记为已拥有');
  await loadV3Data(true);
  window.dispatchEvent(new Event('v3collectionchange'));
}

function bindV3Events() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('#v3CenterEntry') || event.target.closest('[data-v3-nav="center"]')) return showV3Center();
    if (event.target.closest('#v3Refresh')) return loadV3Data(true).then(() => v3Toast('收藏中心已刷新')).catch((error) => v3Toast(error.message, true));

    const tab = event.target.closest('[data-v3-tab]');
    if (tab) {
      v3State.activeTab = tab.dataset.v3Tab;
      history.replaceState({}, '', `/?view=collection&tab=${v3State.activeTab}`);
      renderV3Content();
      return;
    }

    const owned = event.target.closest('[data-v3-owned]');
    if (owned) markV3Owned(owned.dataset.v3Owned).catch((error) => v3Toast(error.message, true));
  });

  document.querySelector('#v3Search')?.addEventListener('input', (event) => {
    v3State.search = event.target.value;
    renderV3Content();
  });
  document.querySelector('#v3GroupFilter')?.addEventListener('change', (event) => {
    v3State.groupId = event.target.value;
    renderV3Content();
  });

  window.addEventListener('v3collectionchange', () => { v3State.loaded = false; });
}

ensureV3Ui();
bindV3Events();
if (new URLSearchParams(location.search).get('view') === 'collection') showV3Center();

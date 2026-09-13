const v3State = {
  groups: [],
  details: [],
  items: [],
  activeTab: 'wishlist',
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

function v3Date(value) {
  if (!value) return '未记录日期';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed);
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
          <p class="v3-lead">看看还缺什么、想买什么，以及每个团体的收藏完成度。</p>
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
        <button type="button" data-v3-tab="trend">↗ 收藏趋势</button>
        <button type="button" data-v3-tab="recent">◷ 最近入手</button>
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

function renderTrend() {
  const owned = filteredV3Items('owned').filter((item) => item.purchase_date);
  const buckets = new Map();
  for (const item of owned) {
    const key = item.purchase_date.slice(0, 7);
    buckets.set(key, (buckets.get(key) || 0) + Math.max(1, Number(item.quantity || 1)));
  }
  const rows = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  if (!rows.length) return '<div class="v3-empty"><strong>还没有可用的入手日期</strong><span>在版本详情里记录购买日期后，这里会显示最近 12 个月的收藏数量趋势。</span></div>';
  const max = Math.max(...rows.map(([, count]) => count), 1);
  return `<div class="v3-trend"><div class="v3-trend-chart">${rows.map(([month, count]) => `
    <div class="v3-trend-col"><span>${count}</span><i style="height:${Math.max(8, Math.round((count / max) * 100))}%"></i><small>${month.slice(2).replace('-', '/')}</small></div>
  `).join('')}</div><p class="v3-hint">按版本的购买日期统计最近 12 个月新增收藏数量，不涉及购买金额。</p></div>`;
}

function renderRecent() {
  const items = filteredV3Items('owned').filter((item) => item.purchase_date).sort((a, b) => b.purchase_date.localeCompare(a.purchase_date)).slice(0, 24);
  if (!items.length) return '<div class="v3-empty"><strong>还没有最近入手记录</strong><span>给已拥有版本补充购买日期后，会自动出现在这里。</span></div>';
  return `<div class="v3-timeline">${items.map((item) => `
    <article><time>${v3Date(item.purchase_date)}</time><div class="v3-timeline-dot"></div><div><strong>${v3Escape(item.group_name)} · ${v3Escape(item.album_name)}</strong><span>${v3Escape(item.version_name)}${Number(item.quantity || 0) > 1 ? ` × ${item.quantity}` : ''}</span></div></article>
  `).join('')}</div>`;
}

function renderV3Content() {
  const content = document.querySelector('#v3Content');
  if (!content) return;
  document.querySelectorAll('[data-v3-tab]').forEach((button) => button.classList.toggle('active', button.dataset.v3Tab === v3State.activeTab));
  if (v3State.activeTab === 'wishlist') content.innerHTML = versionCards(filteredV3Items('wishlist'), 'Wishlist 目前是空的');
  if (v3State.activeTab === 'missing') content.innerHTML = versionCards(filteredV3Items('missing'), '没有缺失版本');
  if (v3State.activeTab === 'groups') content.innerHTML = renderGroupRanking();
  if (v3State.activeTab === 'trend') content.innerHTML = renderTrend();
  if (v3State.activeTab === 'recent') content.innerHTML = renderRecent();
}

function showV3Center() {
  document.querySelector('#homeView')?.classList.add('hidden');
  document.querySelector('#groupView')?.classList.add('hidden');
  document.querySelector('#collectionCenterView')?.classList.remove('hidden');
  document.querySelector('#backButton')?.classList.add('hidden');
  document.querySelector('#primaryAction')?.classList.add('v3-hidden-action');
  document.querySelectorAll('[data-v2-nav], [data-v3-nav]').forEach((button) => button.classList.remove('active'));
  document.querySelector('[data-v3-nav="center"]')?.classList.add('active');
  history.replaceState({}, '', '/?view=collection');
  loadV3Data(true).catch((error) => v3Toast(error.message, true));
}

function hideV3Center() {
  document.querySelector('#collectionCenterView')?.classList.add('hidden');
  document.querySelector('#primaryAction')?.classList.remove('v3-hidden-action');
  document.querySelector('#brandHome')?.click();
}

async function markV3Owned(versionId) {
  await v3Request(`/api/collection/${versionId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'owned', quantity: 1 }),
  });
  v3Toast('已标记为已拥有');
  await loadV3Data(true);
  if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('v3collectionchange'));
}

function bindV3Events() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('#v3CenterEntry') || event.target.closest('[data-v3-nav="center"]')) return showV3Center();
    if (event.target.closest('#v3Back')) return hideV3Center();
    if (event.target.closest('#v3Refresh')) return loadV3Data(true).then(() => v3Toast('收藏中心已刷新')).catch((error) => v3Toast(error.message, true));

    const tab = event.target.closest('[data-v3-tab]');
    if (tab) {
      v3State.activeTab = tab.dataset.v3Tab;
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

const ui = {
  albumList: document.querySelector('#albumList'),
  statusFilter: document.querySelector('#statusFilter'),
  homeView: document.querySelector('#homeView'),
  groupView: document.querySelector('#groupView'),
  groupGrid: document.querySelector('#groupGrid'),
  statsGrid: document.querySelector('.stats-grid'),
  primaryAction: document.querySelector('#primaryAction'),
};

let insightTimer = null;
let regroupTimer = null;

function ensureExperienceUi() {
  if (ui.statsGrid && !document.querySelector('#v2Insights')) {
    ui.statsGrid.insertAdjacentHTML('afterend', `
      <section id="v2Insights" class="v2-insights" aria-label="收藏概览">
        <article class="v2-insight"><small>还缺</small><strong id="v2Missing">0</strong></article>
        <article class="v2-insight"><small>Wishlist</small><strong id="v2Wishlist">0</strong></article>
        <article class="v2-insight"><small>已预购</small><strong id="v2Preordered">0</strong></article>
      </section>
    `);
  }

  const toolbar = document.querySelector('.detail-toolbar');
  if (toolbar && !document.querySelector('#v2StatusChips')) {
    toolbar.insertAdjacentHTML('beforebegin', `
      <div id="v2StatusChips" class="v2-status-chips" aria-label="快捷收藏状态">
        <button class="v2-chip active" type="button" data-v2-status="all">全部</button>
        <button class="v2-chip" type="button" data-v2-status="owned">✓ 已拥有</button>
        <button class="v2-chip" type="button" data-v2-status="missing">○ 缺少</button>
        <button class="v2-chip" type="button" data-v2-status="wishlist">♡ Wishlist</button>
        <button class="v2-chip" type="button" data-v2-status="preordered">⌛ 已预购</button>
      </div>
    `);
  }

  if (!document.querySelector('#v2BottomNav')) {
    document.body.insertAdjacentHTML('beforeend', `
      <nav id="v2BottomNav" class="v2-bottom-nav" aria-label="移动端导航">
        <button type="button" data-v2-nav="home"><strong>⌂</strong>首页</button>
        <button type="button" data-v2-nav="groups"><strong>♡</strong>团体</button>
        <button type="button" data-v2-nav="backup"><strong>⇩</strong>备份</button>
        <button type="button" data-v2-nav="add"><strong>＋</strong>添加</button>
      </nav>
      <button id="v2Fab" class="v2-fab" type="button" aria-label="添加">＋</button>
    `);
  }
}

async function updateInsights() {
  try {
    const response = await fetch('/api/stats');
    if (!response.ok) return;
    const stats = await response.json();
    const missing = Math.max(0, Number(stats.versions || 0) - Number(stats.owned || 0) - Number(stats.wishlist || 0) - Number(stats.preordered || 0));
    const missingNode = document.querySelector('#v2Missing');
    const wishlistNode = document.querySelector('#v2Wishlist');
    const preorderedNode = document.querySelector('#v2Preordered');
    if (missingNode) missingNode.textContent = missing;
    if (wishlistNode) wishlistNode.textContent = Number(stats.wishlist || 0);
    if (preorderedNode) preorderedNode.textContent = Number(stats.preordered || 0);
  } catch (error) {
    console.debug('V0.2 insights unavailable:', error);
  }
}

function scheduleInsights() {
  clearTimeout(insightTimer);
  insightTimer = setTimeout(updateInsights, 120);
}

function getAlbumYear(card) {
  const meta = card.querySelector('.album-heading p')?.textContent || '';
  return meta.match(/(20\d{2})年/)?.[1] || '未注明年份';
}

function regroupAlbums() {
  const list = ui.albumList;
  if (!list || list.dataset.v2Busy === '1') return;
  const directCards = [...list.children].filter((node) => node.classList?.contains('album-card'));
  if (!directCards.length) return;

  list.dataset.v2Busy = '1';
  const buckets = new Map();
  for (const card of directCards) {
    const year = getAlbumYear(card);
    const bucket = buckets.get(year) || [];
    bucket.push(card);
    buckets.set(year, bucket);
  }

  const fragment = document.createDocumentFragment();
  for (const [year, cards] of buckets) {
    const section = document.createElement('section');
    section.className = 'v2-year-section';
    const heading = document.createElement('div');
    heading.className = 'v2-year-heading';
    heading.innerHTML = `<h2>${year}</h2><span>${cards.length} 张专辑</span><div class="v2-year-line"></div>`;
    const grid = document.createElement('div');
    grid.className = 'v2-year-grid';
    cards.forEach((card) => grid.append(card));
    section.append(heading, grid);
    fragment.append(section);
  }
  list.replaceChildren(fragment);
  requestAnimationFrame(() => { list.dataset.v2Busy = '0'; });
}

function scheduleRegroup() {
  clearTimeout(regroupTimer);
  regroupTimer = setTimeout(regroupAlbums, 50);
}

function syncStatusChips() {
  const value = ui.statusFilter?.value || 'all';
  document.querySelectorAll('[data-v2-status]').forEach((button) => {
    button.classList.toggle('active', button.dataset.v2Status === value);
  });
}

function syncNavigation() {
  const inGroup = ui.groupView && !ui.groupView.classList.contains('hidden');
  document.querySelectorAll('[data-v2-nav]').forEach((button) => button.classList.remove('active'));
  document.querySelector(`[data-v2-nav="${inGroup ? 'groups' : 'home'}"]`)?.classList.add('active');
}

function goHomeAndMaybeScroll() {
  document.querySelector('#brandHome')?.click();
  setTimeout(() => document.querySelector('#groupGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

function bindExperienceEvents() {
  document.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-v2-status]');
    if (chip && ui.statusFilter) {
      ui.statusFilter.value = chip.dataset.v2Status;
      ui.statusFilter.dispatchEvent(new Event('change', { bubbles: true }));
      syncStatusChips();
      return;
    }

    const nav = event.target.closest('[data-v2-nav]');
    if (nav) {
      const action = nav.dataset.v2Nav;
      if (action === 'home') document.querySelector('#brandHome')?.click();
      if (action === 'groups') goHomeAndMaybeScroll();
      if (action === 'backup') document.querySelector('#backupButton')?.click();
      if (action === 'add') ui.primaryAction?.click();
      return;
    }

    if (event.target.closest('#v2Fab')) ui.primaryAction?.click();
  });

  ui.statusFilter?.addEventListener('change', syncStatusChips);
}

function bindObservers() {
  if (ui.albumList) {
    new MutationObserver(() => scheduleRegroup()).observe(ui.albumList, { childList: true });
  }

  if (ui.statsGrid) {
    new MutationObserver(() => scheduleInsights()).observe(ui.statsGrid, { childList: true, subtree: true, characterData: true });
  }

  if (ui.homeView && ui.groupView) {
    const observer = new MutationObserver(syncNavigation);
    observer.observe(ui.homeView, { attributes: true, attributeFilter: ['class'] });
    observer.observe(ui.groupView, { attributes: true, attributeFilter: ['class'] });
  }
}

ensureExperienceUi();
bindExperienceEvents();
bindObservers();
syncStatusChips();
syncNavigation();
scheduleInsights();
scheduleRegroup();

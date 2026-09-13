const v5aState = {
  groups: [], details: [], albums: [], versions: [],
  search: '', status: 'all', loaded: false, loading: false,
};

const v5aStatusLabels = { owned: '已拥有', partial: '部分拥有', wishlist: '想要收藏', preordered: '已预购', missing: '待补' };

function v5aEscape(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

async function v5aRequest(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function v5aCover(src, title, className = '') {
  if (src) return `<img class="${className}" src="${v5aEscape(src)}" alt="${v5aEscape(title)}" loading="lazy">`;
  return `<div class="v5a-cover-fallback ${className}" aria-hidden="true">${v5aEscape((title || '?').trim().slice(0, 1).toUpperCase())}</div>`;
}

function v5aAlbumStatus(album) {
  const versions = album.versions || [];
  if (!versions.length) return 'missing';
  const owned = versions.filter((version) => version.status === 'owned').length;
  if (owned === versions.length) return 'owned';
  if (owned > 0) return 'partial';
  if (versions.some((version) => version.status === 'preordered')) return 'preordered';
  if (versions.some((version) => version.status === 'wishlist')) return 'wishlist';
  return 'missing';
}

function v5aFormatDate(date) {
  return date ? date.replace(/-/g, '. ') : '';
}

function ensureV5aHome() {
  const home = document.querySelector('#homeView');
  const topbar = document.querySelector('.topbar');
  if (!home || document.querySelector('#v5aHome')) return;

  home.insertAdjacentHTML('afterbegin', `
    <section id="v5aHome" class="v5a-home" aria-label="K-pop 收藏日记首页">
      <section class="v5a-hero" id="v5aHero">
        <img class="v5a-doodle v5a-doodle-heart" src="/assets/scrapbook/doodle-heart.svg" alt="">
        <img class="v5a-doodle v5a-doodle-star" src="/assets/scrapbook/doodle-star.svg" alt="">
        <img class="v5a-doodle v5a-doodle-bunny" src="/assets/scrapbook/doodle-bunny.svg" alt="">
        <div class="v5a-hero-title">
          <span class="v5a-hero-kicker">MY K-POP SCRAPBOOK</span>
          <h1>K-pop 收藏日记</h1>
          <p>Album Today, A Happier Me ☺</p>
        </div>
        <div id="v5aHeroCollage" class="v5a-hero-collage"></div>
        <aside class="v5a-note v5a-note-left">Good Music<br>Brighter Days ♡</aside>
        <aside class="v5a-note v5a-note-right">收藏的不只是专辑<br>而是那些闪闪发光的日子 ♡</aside>
      </section>

      <section id="v5aFavorites" class="v5a-favorites paper-panel">
        <div class="v5a-favorite-label"><strong>我喜欢的团</strong><span>My Favorite Groups ♡</span></div>
        <div id="v5aFavoriteTrack" class="v5a-favorite-track"></div>
        <button id="v5aAddGroup" class="v5a-add-group" type="button"><span>＋</span>添加团体</button>
      </section>

      <section class="v5a-main-grid">
        <aside class="v5a-sidebar paper-panel" aria-label="收藏分类">
          <button class="active" type="button" data-v5-filter="all">▣ <span>全部专辑</span></button>
          <button type="button" data-v5-scroll="favorites">♡ <span>本命团</span></button>
          <button type="button" data-v5-scroll="recent">☆ <span>回归专辑</span></button>
          <button type="button" data-v5-scroll="limited">♔ <span>限定版</span></button>
          <button type="button" data-v5-open-wishlist>☑ <span>收藏清单</span></button>
          <button type="button" data-v5-filter="owned">▧ <span>已拥有</span></button>
          <button type="button" data-v5-filter="wishlist">♡ <span>想要收藏</span></button>
          <button type="button" data-v5-filter="missing">♧ <span>待补</span></button>
          <button type="button" data-v5-scroll="notes">♩ <span>我的笔记</span></button>
          <div class="v5a-sidebar-note">K-pop makes<br>life sweeter ♡</div>
        </aside>

        <main class="v5a-content">
          <section id="v5aRecentSection" class="v5a-section-block">
            <div class="v5a-section-heading">
              <div><span>⭐</span><div><h2>回归专辑</h2><p>每一次回归，都是新的心动。</p></div></div>
              <div class="v5a-filter-chips">
                <button class="active" type="button" data-v5-filter="all">全部</button>
                <button type="button" data-v5-filter="owned">已拥有</button>
                <button type="button" data-v5-filter="wishlist">想要收藏</button>
                <button type="button" data-v5-filter="missing">待补</button>
              </div>
            </div>
            <div id="v5aAlbumGrid" class="v5a-album-grid"></div>
          </section>

          <section id="v5aLimitedSection" class="v5a-section-block v5a-limited-block">
            <div class="v5a-section-heading"><div><span>♛</span><div><h2>限定版</h2><p>特别的版本，收藏特别的回忆。</p></div></div></div>
            <div id="v5aLimitedGrid" class="v5a-limited-grid"></div>
          </section>
        </main>

        <aside id="v5aNotes" class="v5a-right-rail">
          <section class="v5a-daily-card paper-panel">
            <div class="v5a-rail-title">小小日常 ✦</div>
            <div id="v5aDailyPhoto" class="v5a-daily-photo"></div>
            <p>好音乐<br>会一直陪着我 ♡</p><small id="v5aToday"></small>
          </section>
          <section class="v5a-recent-card paper-panel"><div class="v5a-rail-title">最近收录 <em>New in!</em></div><div id="v5aLatestAdded"></div></section>
          <section class="v5a-wishlist-card paper-panel"><div class="v5a-rail-title">心愿清单 <em>Wishlist ♡</em></div><div id="v5aWishlist"></div><button type="button" data-v5-open-wishlist>查看全部 →</button></section>
          <section class="v5a-encourage-card"><strong>继续收集吧！</strong><span>下一张专辑，下一段故事，也会让我们更靠近幸福。</span><b>☺</b></section>
        </aside>
      </section>
    </section>
  `);

  if (topbar && !document.querySelector('#v5aTopNav')) {
    topbar.insertAdjacentHTML('beforeend', `
      <nav id="v5aTopNav" class="v5a-top-nav" aria-label="首页导航">
        <button class="active" type="button" data-v5-home>⌂ 首页</button>
        <button type="button" data-v5-scroll="recent">我的收藏</button>
        <button type="button" data-v5-scroll="limited">专辑图鉴</button>
        <button type="button" data-v5-open-wishlist>心愿清单</button>
        <button type="button" data-v5-scroll="notes">关于我</button>
      </nav>
      <label id="v5aTopSearch" class="v5a-top-search"><span>⌕</span><input type="search" placeholder="搜索专辑、团名或关键词…" autocomplete="off"></label>
      <div id="v5aProfile" class="v5a-profile" title="Collecting Happiness ♡"><span>♡</span></div>
    `);
  }

  if (!document.querySelector('#v5aPlayer')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="v5aPlayer" class="v5a-player" aria-label="装饰音乐播放器">
        <div id="v5aPlayerCover" class="v5a-player-cover"></div>
        <div class="v5a-player-copy"><strong id="v5aPlayerTitle">My Collection</strong><span id="v5aPlayerArtist">K-pop Collection</span></div>
        <button type="button" aria-label="上一首">◀</button><button type="button" class="v5a-play" aria-label="播放暂停">Ⅱ</button><button type="button" aria-label="下一首">▶</button>
        <div class="v5a-player-progress"><i></i><b></b></div><small>0:42 / 3:28</small><span class="v5a-player-icons">♡　☷　⌕</span>
      </div>
    `);
  }
}

function syncV5aMode() {
  const home = document.querySelector('#homeView');
  const active = Boolean(home && !home.classList.contains('hidden'));
  document.body.classList.toggle('v5a-home-active', active);
  if (active && !v5aState.loaded) loadV5aData().catch((error) => console.warn('V0.5A load failed:', error));
}

function flattenV5aData() {
  v5aState.albums = [];
  v5aState.versions = [];
  for (const detail of v5aState.details) {
    for (const album of detail.albums || []) {
      const normalizedAlbum = { ...album, group_id: detail.group.id, group_name: detail.group.name, group_cover: detail.group.cover };
      normalizedAlbum.status = v5aAlbumStatus(normalizedAlbum);
      v5aState.albums.push(normalizedAlbum);
      for (const version of album.versions || []) {
        v5aState.versions.push({ ...version, group_id: detail.group.id, group_name: detail.group.name, album_id: album.id, album_name: album.name, album_cover: album.cover, release_date: album.release_date });
      }
    }
  }
}

async function loadV5aData(force = false) {
  if (v5aState.loading || (v5aState.loaded && !force)) return;
  v5aState.loading = true;
  try {
    const groups = await v5aRequest('/api/groups');
    const details = await Promise.all(groups.map((group) => v5aRequest(`/api/groups/${group.id}`)));
    v5aState.groups = groups;
    v5aState.details = details;
    flattenV5aData();
    v5aState.loaded = true;
    renderV5a();
  } finally { v5aState.loading = false; }
}

function renderV5aHero() {
  const collage = document.querySelector('#v5aHeroCollage');
  if (!collage) return;
  const albumCovers = v5aState.albums.filter((album) => album.cover).sort((a, b) => (b.release_date || '').localeCompare(a.release_date || '')).slice(0, 5);
  const groupCovers = v5aState.groups.filter((group) => group.cover).slice(0, 4);
  const source = [...albumCovers, ...groupCovers].slice(0, 6);
  collage.innerHTML = source.length ? source.map((item, index) => `<figure class="v5a-polaroid v5a-polaroid-${index + 1}">${v5aCover(item.cover, item.name)}<figcaption>${v5aEscape(item.name)}</figcaption></figure>`).join('') : '<div class="v5a-hero-empty">把第一张喜欢的专辑放进来吧 ♡</div>';
}

function renderV5aFavorites() {
  const track = document.querySelector('#v5aFavoriteTrack');
  if (!track) return;
  track.innerHTML = v5aState.groups.length ? v5aState.groups.slice(0, 10).map((group) => `
    <button class="v5a-favorite-group" type="button" data-v5-group="${group.id}"><span class="v5a-favorite-avatar">${v5aCover(group.cover, group.name)}</span><strong>${v5aEscape(group.name)}</strong><small>${v5aEscape(group.korean_name || `${group.owned_count}/${group.version_count} owned`)}</small></button>
  `).join('') : '<div class="v5a-inline-empty">还没有团体，先添加你的第一个本命团吧 ♡</div>';
}

function filteredV5aAlbums() {
  const keyword = v5aState.search.trim().toLowerCase();
  return v5aState.albums.filter((album) => {
    const searchOk = !keyword || `${album.group_name} ${album.name} ${album.korean_name || ''} ${album.album_type || ''}`.toLowerCase().includes(keyword);
    const statusOk = v5aState.status === 'all' || album.status === v5aState.status || (v5aState.status === 'owned' && album.status === 'partial');
    return searchOk && statusOk;
  });
}

function albumCardMarkup(album) {
  const status = album.status || 'missing';
  return `<article class="v5a-album-card" data-v5-group="${album.group_id}"><div class="v5a-album-cover">${v5aCover(album.cover, album.name)}</div><button class="v5a-heart" type="button" aria-label="收藏">♡</button><small>${v5aEscape(album.group_name)}</small><h3>${v5aEscape(album.name)}</h3><time>${v5aFormatDate(album.release_date)}</time><span class="v5a-status ${status}">${v5aStatusLabels[status] || status}</span></article>`;
}

function renderV5aAlbums() {
  const grid = document.querySelector('#v5aAlbumGrid');
  if (!grid) return;
  const albums = filteredV5aAlbums().sort((a, b) => (b.release_date || '').localeCompare(a.release_date || '')).slice(0, 8);
  grid.innerHTML = albums.length ? albums.map(albumCardMarkup).join('') : '<div class="v5a-empty-card">这里还没有符合条件的专辑 ♡</div>';
}

function renderV5aLimited() {
  const grid = document.querySelector('#v5aLimitedGrid');
  if (!grid) return;
  const specialPattern = /(limited|special|collector|digipack|pob|限定|特典|收藏|珍藏)/i;
  const items = v5aState.versions.filter((version) => specialPattern.test(`${version.edition_type || ''} ${version.version_name || ''}`)).sort((a, b) => (b.release_date || '').localeCompare(a.release_date || '')).slice(0, 5);
  grid.innerHTML = items.length ? items.map((item) => `<article class="v5a-limited-card" data-v5-group="${item.group_id}"><div class="v5a-limited-cover">${v5aCover(item.cover || item.album_cover, item.album_name)}</div><span class="v5a-sticker">${v5aEscape((item.edition_type || item.version_name || 'LIMITED').toUpperCase().slice(0, 14))}</span><strong>${v5aEscape(item.album_name)}</strong><small>${v5aEscape(item.version_name)}</small></article>`).join('') : '<div class="v5a-empty-card compact">等你录入限定版、特典版或 Digipack 后，这里会自动出现。</div>';
}

function renderV5aRightRail() {
  const latest = [...v5aState.albums].sort((a, b) => Number(b.id) - Number(a.id))[0];
  const daily = document.querySelector('#v5aDailyPhoto');
  const latestNode = document.querySelector('#v5aLatestAdded');
  const wishlistNode = document.querySelector('#v5aWishlist');
  const today = document.querySelector('#v5aToday');
  if (today) today.textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (daily) {
    const source = v5aState.groups.find((group) => group.cover) || latest;
    daily.innerHTML = source ? v5aCover(source.cover, source.name) : '<div class="v5a-cover-fallback">♡</div>';
  }
  if (latestNode) latestNode.innerHTML = latest ? `<button class="v5a-latest-row" type="button" data-v5-group="${latest.group_id}"><span>${v5aCover(latest.cover, latest.name)}</span><div><small>${v5aEscape(latest.group_name)}</small><strong>${v5aEscape(latest.name)}</strong><em>刚刚加入收藏馆 ♡</em></div></button>` : '<p class="v5a-small-empty">还没有专辑记录。</p>';
  if (wishlistNode) {
    const wishes = v5aState.versions.filter((version) => version.status === 'wishlist').slice(0, 5);
    wishlistNode.innerHTML = wishes.length ? wishes.map((item) => `<label><i></i><span>${v5aEscape(item.group_name)} - ${v5aEscape(item.album_name)}${item.version_name ? `（${v5aEscape(item.version_name)}）` : ''}</span></label>`).join('') : '<p class="v5a-small-empty">心愿清单现在是空的 ♡</p>';
  }
}

function renderV5aPlayer() {
  const album = [...v5aState.albums].sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))[0];
  if (!album) return;
  const cover = document.querySelector('#v5aPlayerCover');
  if (cover) cover.innerHTML = v5aCover(album.cover, album.name);
  document.querySelector('#v5aPlayerTitle').textContent = album.name;
  document.querySelector('#v5aPlayerArtist').textContent = album.group_name;
}

function renderV5a() {
  renderV5aHero(); renderV5aFavorites(); renderV5aAlbums(); renderV5aLimited(); renderV5aRightRail(); renderV5aPlayer();
}

function openV5aGroup(groupId) {
  const legacyCard = document.querySelector(`#groupGrid [data-group-id="${CSS.escape(String(groupId))}"]`);
  if (legacyCard) legacyCard.click();
  else location.href = `/?group=${encodeURIComponent(groupId)}`;
}

function syncV5aFilters() {
  document.querySelectorAll('[data-v5-filter]').forEach((button) => button.classList.toggle('active', button.dataset.v5Filter === v5aState.status));
}

function scrollV5aTarget(target) {
  const map = { favorites: '#v5aFavorites', recent: '#v5aRecentSection', limited: '#v5aLimitedSection', notes: '#v5aNotes' };
  document.querySelector(map[target])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openV5aWishlist() {
  const entry = document.querySelector('#v3CenterEntry');
  if (entry) entry.click();
  else location.href = '/?view=collection&tab=wishlist';
  setTimeout(() => document.querySelector('[data-v3-tab="wishlist"]')?.click(), 80);
}

function bindV5aEvents() {
  window.addEventListener('v3collectionchange', () => {
    v5aState.loaded = false;
    if (document.body.classList.contains('v5a-home-active')) {
      loadV5aData(true).catch((error) => console.warn('V0.5A refresh failed:', error));
    }
  });
  document.addEventListener('click', (event) => {
    const group = event.target.closest('[data-v5-group]');
    if (group) { event.preventDefault(); openV5aGroup(group.dataset.v5Group); return; }
    const filter = event.target.closest('[data-v5-filter]');
    if (filter) { v5aState.status = filter.dataset.v5Filter; syncV5aFilters(); renderV5aAlbums(); scrollV5aTarget('recent'); return; }
    const scroll = event.target.closest('[data-v5-scroll]');
    if (scroll) { scrollV5aTarget(scroll.dataset.v5Scroll); return; }
    if (event.target.closest('[data-v5-open-wishlist]')) { openV5aWishlist(); return; }
    if (event.target.closest('[data-v5-home]')) document.querySelector('#brandHome')?.click();
    if (event.target.closest('#v5aAddGroup')) document.querySelector('#primaryAction')?.click();
  });

  document.querySelector('#v5aTopSearch input')?.addEventListener('input', (event) => { v5aState.search = event.target.value; renderV5aAlbums(); });
  const home = document.querySelector('#homeView');
  if (home) new MutationObserver(syncV5aMode).observe(home, { attributes: true, attributeFilter: ['class'] });
  const legacyGrid = document.querySelector('#groupGrid');
  if (legacyGrid) {
    let timer = null;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { v5aState.loaded = false; if (document.body.classList.contains('v5a-home-active')) loadV5aData(true).catch(() => {}); }, 150);
    }).observe(legacyGrid, { childList: true, subtree: true });
  }
}

ensureV5aHome();
bindV5aEvents();
syncV5aMode();

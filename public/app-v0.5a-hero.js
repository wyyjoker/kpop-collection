const v5aHeroWall = {
  groups: [],
  albums: [],
  loaded: false,
  loading: false,
};

function heroEscape(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);
}

async function heroJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function ensureHeroWall() {
  const hero = document.querySelector('#v5aHero');
  if (!hero || document.querySelector('#v5aCollageWall')) return;

  hero.querySelector('.v5a-hero-title')?.classList.add('v5a-title-layered');
  hero.insertAdjacentHTML('beforeend', `
    <div id="v5aCollageWall" class="v5a-collage-wall" aria-hidden="true"></div>
    <div class="v5a-collage-caption v5a-caption-left">Same stars,<br>different stories,<br>still K-pop ♡</div>
    <div class="v5a-collage-caption v5a-caption-right">Collect people,<br>moments, albums,<br>happiness ♡</div>
    <div class="v5a-collage-ribbon">GOOD MUSIC · BETTER DAYS · KEEP COLLECTING ♡</div>
    <span class="v5a-tape-strip v5a-tape-strip-a"></span>
    <span class="v5a-tape-strip v5a-tape-strip-b"></span>
    <span class="v5a-tape-strip v5a-tape-strip-c"></span>
    <img class="v5a-collage-deco v5a-collage-flower" src="/assets/scrapbook/doodle-flower.svg" alt="">
    <img class="v5a-collage-deco v5a-collage-bow" src="/assets/scrapbook/doodle-bow.svg" alt="">
    <span class="v5a-collage-sparkle v5a-sparkle-a">✦</span>
    <span class="v5a-collage-sparkle v5a-sparkle-b">♡</span>
    <span class="v5a-collage-sparkle v5a-sparkle-c">★</span>
  `);
}

function flattenHeroAlbums(details) {
  return details.flatMap((detail) => (detail.albums || []).map((album) => ({
    ...album,
    group_name: detail.group?.name || '',
  })));
}

function makeHeroSources() {
  const real = [];
  const seen = new Set();

  const push = (src, label, meta = '') => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    real.push({ src, label, meta });
  };

  const sortedAlbums = [...v5aHeroWall.albums]
    .filter((album) => album.cover)
    .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''));

  const groupsWithCover = v5aHeroWall.groups.filter((group) => group.cover);
  const featureGroup = groupsWithCover[0];
  if (featureGroup) push(featureGroup.cover, featureGroup.name, 'MY FAVORITE GROUP');

  sortedAlbums.slice(0, 6).forEach((album) => {
    push(album.cover, album.name, album.group_name || 'ALBUM MEMORY');
  });

  groupsWithCover.slice(1, 5).forEach((group) => {
    push(group.cover, group.name, 'FAVORITE GROUP');
  });

  return [
    { src: '/assets/scrapbook/room-shelf.svg', label: 'My collection corner', meta: 'ROOM DIARY', scene: true },
    ...real.slice(0, 4),
    { src: '/assets/scrapbook/vinyl-corner.svg', label: 'Music on repeat', meta: 'VINYL DAYS', scene: true },
    ...real.slice(4, 7),
  ].slice(0, 9);
}

function heroPhotoMarkup(item, index) {
  const slot = index + 1;
  const classes = [`v5a-wall-photo`, `v5a-wall-slot-${slot}`];
  if (item.scene) classes.push('v5a-wall-scene');
  if ([3, 7, 8].includes(slot)) classes.push('v5a-wall-front');
  if ([1, 2, 5, 6].includes(slot)) classes.push('v5a-wall-back');

  return `
    <figure class="${classes.join(' ')}">
      <img src="${heroEscape(item.src)}" alt="" loading="lazy">
      <figcaption><small>${heroEscape(item.meta || '')}</small><strong>${heroEscape(item.label || '')}</strong></figcaption>
    </figure>
  `;
}

function renderHeroWall() {
  const wall = document.querySelector('#v5aCollageWall');
  if (!wall) return;

  const sources = makeHeroSources();
  wall.innerHTML = sources.length
    ? sources.map(heroPhotoMarkup).join('')
    : '<div class="v5a-wall-empty">把喜欢的团体和专辑放进来，Hero 会自动变成你的收藏拼贴墙 ♡</div>';

  document.documentElement.classList.toggle('v5a-hero-has-many', sources.length >= 6);
}

async function loadHeroWall(force = false) {
  if (v5aHeroWall.loading || (v5aHeroWall.loaded && !force)) return;
  v5aHeroWall.loading = true;
  try {
    const groups = await heroJson('/api/groups');
    const details = await Promise.all(groups.slice(0, 6).map((group) => heroJson(`/api/groups/${group.id}`)));
    v5aHeroWall.groups = groups;
    v5aHeroWall.albums = flattenHeroAlbums(details);
    v5aHeroWall.loaded = true;
    renderHeroWall();
  } catch (error) {
    console.debug('V0.5A Hero collage data unavailable:', error);
    renderHeroWall();
  } finally {
    v5aHeroWall.loading = false;
  }
}

function syncHeroWallVisibility() {
  const home = document.querySelector('#homeView');
  document.documentElement.classList.toggle('v5a-hero-wall-active', Boolean(home && !home.classList.contains('hidden')));
}

function watchHeroWallData() {
  const groupGrid = document.querySelector('#groupGrid');
  if (!groupGrid) return;
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => loadHeroWall(true), 220);
  }).observe(groupGrid, { childList: true, subtree: true });
}

ensureHeroWall();
loadHeroWall();
syncHeroWallVisibility();
watchHeroWallData();

const heroWallHome = document.querySelector('#homeView');
if (heroWallHome) {
  new MutationObserver(syncHeroWallVisibility).observe(heroWallHome, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

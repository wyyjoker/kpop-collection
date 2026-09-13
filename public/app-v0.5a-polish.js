const v5aPolish = { groups: [], stats: null };

function polishEscape(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

async function polishJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function ensurePolishMarkup() {
  const hero = document.querySelector('#v5aHero');
  if (hero && !document.querySelector('#v5aPolishStage')) {
    hero.insertAdjacentHTML('afterbegin', `
      <div id="v5aPolishStage" class="v5a-polish-stage" aria-hidden="true">
        <figure class="v5a-scene-card v5a-scene-left"><img src="/assets/scrapbook/room-shelf.svg" alt=""></figure>
        <figure id="v5aFeaturePhoto" class="v5a-feature-photo"><div class="v5a-feature-placeholder">MY<br>COLLECTION<br>♡</div><figcaption>Good Music · Better Me</figcaption></figure>
        <figure class="v5a-scene-card v5a-scene-right"><img src="/assets/scrapbook/vinyl-corner.svg" alt=""></figure>
      </div>
      <div class="v5a-hero-sticker v5a-sticker-a">More K-pop<br>More Happy ♡</div>
      <div class="v5a-hero-sticker v5a-sticker-b">Same Stars<br>Different Stories<br>But Still K-pop ♡</div>
      <div class="v5a-hero-sticker v5a-sticker-c">A SMALL<br>COLLECTION<br>A BIGGER<br>HAPPINESS ♡</div>
      <div id="v5aPolishStats" class="v5a-polish-stats"></div>
    `);
  }

  const favorites = document.querySelector('#v5aFavorites');
  if (favorites && !favorites.querySelector('.v5a-paper-seam')) {
    favorites.insertAdjacentHTML('beforeend', '<span class="v5a-paper-seam" aria-hidden="true"></span>');
  }

  document.querySelectorAll('.v5a-section-block, .v5a-right-rail > section, .v5a-sidebar').forEach((node, index) => {
    if (node.querySelector(':scope > .v5a-washi')) return;
    const tape = document.createElement('span');
    tape.className = `v5a-washi v5a-washi-${(index % 4) + 1}`;
    tape.setAttribute('aria-hidden', 'true');
    node.prepend(tape);
  });

  const topbar = document.querySelector('.topbar');
  if (topbar && !document.querySelector('#v5aTopMantra')) {
    topbar.insertAdjacentHTML('afterbegin', '<div id="v5aTopMantra" class="v5a-top-mantra">Good Music<br>Brighter Days ♡</div>');
  }
}

function renderPolishFeature() {
  const feature = document.querySelector('#v5aFeaturePhoto');
  if (!feature) return;
  const group = v5aPolish.groups.find((item) => item.cover) || v5aPolish.groups[0];
  if (!group?.cover) return;
  feature.innerHTML = `<img src="${polishEscape(group.cover)}" alt="${polishEscape(group.name)}"><figcaption>${polishEscape(group.name)} · Collecting Happiness ♡</figcaption>`;
}

function renderPolishStats() {
  const node = document.querySelector('#v5aPolishStats');
  if (!node || !v5aPolish.stats) return;
  const stats = v5aPolish.stats;
  const completion = Number(stats.completion || 0);
  node.innerHTML = `<span><b>${Number(stats.groups || 0)}</b> GROUPS</span><i></i><span><b>${Number(stats.albums || 0)}</b> ALBUMS</span><i></i><span><b>${Number(stats.owned || 0)}</b> OWNED</span><i></i><span><b>${completion}%</b> COMPLETE</span>`;
}

async function loadPolishData() {
  try {
    const [groups, stats] = await Promise.all([polishJson('/api/groups'), polishJson('/api/stats')]);
    v5aPolish.groups = groups;
    v5aPolish.stats = stats;
    renderPolishFeature();
    renderPolishStats();
  } catch (error) {
    console.debug('V0.5A polish data unavailable:', error);
  }
}

function syncPolishVisibility() {
  const home = document.querySelector('#homeView');
  document.documentElement.classList.toggle('v5a-polished-home', Boolean(home && !home.classList.contains('hidden')));
}

function refreshPolishAfterLegacyChanges() {
  const groupGrid = document.querySelector('#groupGrid');
  if (!groupGrid) return;
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(loadPolishData, 180);
  }).observe(groupGrid, { childList: true, subtree: true });
}

ensurePolishMarkup();
loadPolishData();
syncPolishVisibility();
refreshPolishAfterLegacyChanges();

const polishHome = document.querySelector('#homeView');
if (polishHome) new MutationObserver(syncPolishVisibility).observe(polishHome, { attributes: true, attributeFilter: ['class'] });

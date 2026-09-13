const svtCatalogState = { catalog: null, loading: null };

function svtEscape(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);
}

function svtNormalize(value = '') {
  return String(value).trim().toLocaleLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
}

async function loadSvtCatalog() {
  if (svtCatalogState.catalog) return svtCatalogState.catalog;
  if (!svtCatalogState.loading) {
    svtCatalogState.loading = fetch('/data/seventeen-catalog.json')
      .then((response) => {
        if (!response.ok) throw new Error(`SEVENTEEN catalog request failed: ${response.status}`);
        return response.json();
      })
      .then((catalog) => {
        svtCatalogState.catalog = catalog;
        return catalog;
      });
  }
  return svtCatalogState.loading;
}

function svtCurrentGroupName() {
  return document.querySelector('#groupHero h1')?.textContent?.trim() || '';
}

function svtTrackCount(album) {
  return (album.discs || []).reduce((sum, disc) => sum + (disc.tracks || []).length, 0);
}

function svtTracklistMarkup(album) {
  const multiDisc = (album.discs || []).length > 1;
  const discs = (album.discs || []).map((disc) => `
    <section class="svt-disc">
      ${multiDisc ? `<h4>DISC ${Number(disc.disc || 1)}</h4>` : ''}
      <ol>
        ${(disc.tracks || []).map((track) => `<li><span>${svtEscape(typeof track === 'string' ? track : track.title)}</span></li>`).join('')}
      </ol>
    </section>
  `).join('');

  return `
    <details class="svt-tracklist">
      <summary>
        <span><b>♪</b> TRACKLIST</span>
        <small>${svtTrackCount(album)} Tracks</small>
      </summary>
      <div class="svt-tracklist-paper">${discs}</div>
    </details>
  `;
}

function ensureSvtCatalogBadge(catalog) {
  const heroContent = document.querySelector('#groupHero .group-hero-content');
  if (!heroContent || heroContent.querySelector('.svt-catalog-badge')) return;
  const tracks = catalog.albums.reduce((sum, album) => sum + svtTrackCount(album), 0);
  const badge = document.createElement('div');
  badge.className = 'svt-catalog-badge';
  badge.innerHTML = `<span>SEVENTEEN DISCOGRAPHY</span><strong>${catalog.albums.length} Releases · ${tracks} Tracks</strong>`;
  heroContent.append(badge);
}

async function decorateSvtAlbums() {
  if (svtNormalize(svtCurrentGroupName()) !== 'seventeen') return;
  const catalog = await loadSvtCatalog();
  const albumMap = new Map(catalog.albums.map((album) => [svtNormalize(album.name), album]));

  ensureSvtCatalogBadge(catalog);

  document.querySelectorAll('#albumList .album-card').forEach((card) => {
    if (card.querySelector('.svt-tracklist')) return;
    const title = card.querySelector('.album-heading h3')?.textContent?.trim();
    const album = albumMap.get(svtNormalize(title));
    if (!album) return;
    const content = card.querySelector('.album-content');
    const heading = card.querySelector('.album-heading');
    if (!content || !heading) return;
    card.classList.add('svt-catalog-album');
    heading.insertAdjacentHTML('afterend', svtTracklistMarkup(album));
  });
}

function scheduleSvtDecoration() {
  clearTimeout(scheduleSvtDecoration.timer);
  scheduleSvtDecoration.timer = setTimeout(() => {
    decorateSvtAlbums().catch((error) => console.debug('SEVENTEEN tracklist decoration skipped:', error));
  }, 80);
}

const svtAlbumList = document.querySelector('#albumList');
if (svtAlbumList) new MutationObserver(scheduleSvtDecoration).observe(svtAlbumList, { childList: true, subtree: true });

const svtGroupView = document.querySelector('#groupView');
if (svtGroupView) new MutationObserver(scheduleSvtDecoration).observe(svtGroupView, { attributes: true, attributeFilter: ['class'] });

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-group-id], #backButton, #brandHome')) setTimeout(scheduleSvtDecoration, 120);
});

loadSvtCatalog().then(scheduleSvtDecoration).catch((error) => console.debug('SEVENTEEN catalog unavailable:', error));

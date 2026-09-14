require('dotenv').config();

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { importCatalog } = require('./import-catalog');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'public', 'data', 'catalog-registry.json');
const CACHE_DIR = path.join(ROOT, 'data', 'catalog-cache');
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(ROOT, 'data', 'kpop-collection.db'));
const USER_AGENT = 'kpop-collection/0.5 (https://github.com/wyyjoker/kpop-collection)';
const MUSICBRAINZ = 'https://musicbrainz.org/ws/2';
const RATE_LIMIT_MS = 1150;
const CATALOG_VERSION = 1;
const EXCLUDED_SECONDARY = new Set(['Live', 'Remix', 'Soundtrack', 'DJ-mix', 'Interview', 'Spokenword']);
const ALLOWED_PRIMARY = new Set(['Album', 'EP', 'Single']);
const VIDEO_ONLY = /DVD|Blu-ray|VHS|VCD|LaserDisc/i;
const DIGITAL_ONLY = /^Digital Media$/i;

function args(argv) {
  const out = { bestEffort: false, ifMissing: false, force: false, only: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--best-effort') out.bestEffort = true;
    else if (value === '--if-missing') out.ifMissing = true;
    else if (value === '--force') out.force = true;
    else if (value === '--only') out.only = String(argv[++i] || '').split(',').map((v) => v.trim()).filter(Boolean);
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastRequestAt = 0;
async function mb(pathname, attempt = 0) {
  const wait = Math.max(0, RATE_LIMIT_MS - (Date.now() - lastRequestAt));
  if (wait) await delay(wait);
  lastRequestAt = Date.now();
  const response = await fetch(`${MUSICBRAINZ}${pathname}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await delay(1500 * (attempt + 1));
    return mb(pathname, attempt + 1);
  }
  if (!response.ok) throw new Error(`MusicBrainz ${response.status}: ${pathname}`);
  return response.json();
}

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  return new sqlite3.Database(DB_PATH);
}

function hasImportMarker(slug) {
  const db = openDb();
  return new Promise((resolve) => {
    db.get('SELECT catalog_key FROM catalog_imports WHERE catalog_key = ?', [`${slug}-catalog-v${CATALOG_VERSION}`], (error, row) => {
      db.close(() => resolve(!error && Boolean(row)));
    });
  });
}

function mediaFormats(release) {
  return (release.media || []).map((m) => m.format).filter(Boolean);
}

function isPhysical(release) {
  const formats = mediaFormats(release);
  return formats.some((format) => !DIGITAL_ONLY.test(format));
}

function isRelevantRelease(release) {
  if (release.status && release.status !== 'Official') return false;
  const group = release['release-group'] || {};
  if (!ALLOWED_PRIMARY.has(group['primary-type'])) return false;
  const secondary = new Set(group['secondary-types'] || []);
  for (const value of EXCLUDED_SECONDARY) if (secondary.has(value)) return false;
  return isPhysical(release);
}

function audioMedia(release) {
  const physical = (release.media || []).filter((medium) => medium.format && !DIGITAL_ONLY.test(medium.format));
  const audio = physical.filter((medium) => !VIDEO_ONLY.test(medium.format));
  return audio.length ? audio : physical;
}

function trackCount(release) {
  return audioMedia(release).reduce((sum, medium) => sum + (medium.tracks || []).length, 0);
}

function canonicalScore(release) {
  const country = release.country || '';
  let score = trackCount(release) * 10;
  if (country === 'KR') score += 500;
  else if (country === 'JP') score += 350;
  else if (country === 'XW') score += 150;
  if (mediaFormats(release).some((f) => /^CD$/i.test(f))) score += 100;
  if (release['cover-art-archive']?.front) score += 40;
  return score;
}

function coverFor(release) {
  return release?.['cover-art-archive']?.front ? `https://coverartarchive.org/release/${release.id}/front-500` : '';
}

function validBarcode(value) {
  const text = String(value || '').replace(/\s+/g, '');
  return /^\d{8,14}$/.test(text) ? text : '';
}

function catalogNumbers(release) {
  const values = [];
  for (const info of release['label-info'] || []) if (info['catalog-number']) values.push(info['catalog-number']);
  return [...new Set(values)].join(' / ');
}

function cleanSuffix(base, title) {
  const a = String(base || '').trim();
  const b = String(title || '').trim();
  if (!b) return '';
  if (b.toLowerCase() === a.toLowerCase()) return '';
  if (b.toLowerCase().startsWith(a.toLowerCase())) {
    let rest = b.slice(a.length).trim();
    rest = rest.replace(/^[-–—:]\s*/, '').trim();
    const wrapped = rest.match(/^\((.*)\)$/) || rest.match(/^\[(.*)\]$/);
    if (wrapped) rest = wrapped[1].trim();
    if (rest) return rest;
  }
  return b;
}

function versionBaseName(groupTitle, release) {
  const suffix = cleanSuffix(groupTitle, release.title);
  if (suffix) return suffix;
  if (release.disambiguation) return release.disambiguation.trim();
  const format = mediaFormats(release).filter((f) => !DIGITAL_ONLY.test(f)).join(' + ') || 'Physical';
  return `${format}${release.country ? ` · ${release.country}` : ''}`;
}

function uniqueVersionNames(groupTitle, releases) {
  const used = new Map();
  return releases.map((release) => {
    let name = versionBaseName(groupTitle, release) || 'Standard Edition';
    const key = name.toLowerCase();
    const seen = used.get(key) || 0;
    used.set(key, seen + 1);
    if (seen) {
      const country = release.country || 'INTL';
      const barcode = validBarcode(release.barcode);
      const cat = catalogNumbers(release);
      name = `${name} · ${country}${barcode ? ` · ${barcode}` : cat ? ` · ${cat}` : ` · ${seen + 1}`}`;
    }
    return name;
  });
}

function releaseTracks(release) {
  return audioMedia(release).map((medium, index) => ({
    disc: index + 1,
    tracks: (medium.tracks || []).map((track) => ({ title: track.title || track.recording?.title || `Track ${track.position || ''}`.trim() })),
  })).filter((disc) => disc.tracks.length);
}

function earliestDate(releases, fallback = '') {
  return releases.map((r) => r.date).filter(Boolean).sort()[0] || fallback || '';
}

function typeLabel(group) {
  const secondary = group['secondary-types'] || [];
  return [group['primary-type'], ...secondary.filter((value) => !EXCLUDED_SECONDARY.has(value))].filter(Boolean).join(' · ');
}

async function browseReleases(artistId) {
  const releases = [];
  let offset = 0;
  for (;;) {
    const query = new URLSearchParams({ artist: artistId, inc: 'release-groups+media+recordings+labels', fmt: 'json', limit: '100', offset: String(offset) });
    const data = await mb(`/release?${query.toString()}`);
    releases.push(...(data.releases || []));
    offset += data.releases?.length || 0;
    if (!data.releases?.length || offset >= Number(data['release-count'] || 0)) break;
  }
  return releases;
}

function buildCatalog(artist, releases) {
  const relevant = releases.filter(isRelevantRelease);
  const groups = new Map();
  for (const release of relevant) {
    const rg = release['release-group'];
    if (!rg?.id) continue;
    if (!groups.has(rg.id)) groups.set(rg.id, { releaseGroup: rg, releases: [] });
    groups.get(rg.id).releases.push(release);
  }

  const albums = [];
  const versionReleases = {};
  for (const { releaseGroup, releases: physicalReleases } of groups.values()) {
    physicalReleases.sort((a, b) => canonicalScore(b) - canonicalScore(a) || String(a.date || '').localeCompare(String(b.date || '')));
    const canonical = physicalReleases[0];
    const artRelease = physicalReleases.find((release) => release['cover-art-archive']?.front) || canonical;
    const albumName = releaseGroup.title || canonical.title;
    const album = {
      name: albumName,
      release_date: releaseGroup['first-release-date'] || earliestDate(physicalReleases),
      album_type: typeLabel(releaseGroup) || 'Physical Release',
      cover: coverFor(artRelease),
      notes: `MusicBrainz release group ${releaseGroup.id}`,
      discs: releaseTracks(canonical),
    };
    if (!album.discs.length) continue;
    albums.push(album);

    const names = uniqueVersionNames(albumName, physicalReleases);
    versionReleases[albumName] = {
      source: `https://musicbrainz.org/release-group/${releaseGroup.id}`,
      versions: physicalReleases.map((release, index) => {
        const formats = mediaFormats(release).filter((f) => !DIGITAL_ONLY.test(f));
        return {
          version_name: names[index],
          edition_type: `${formats.join(' + ') || 'Physical'}${release.country ? ` · ${release.country}` : ''}`,
          barcode: validBarcode(release.barcode),
          cover: coverFor(release) || coverFor(artRelease),
          note: [catalogNumbers(release) ? `Catalog: ${catalogNumbers(release)}` : '', release.date ? `Release: ${release.date}` : '', `MusicBrainz: ${release.id}`].filter(Boolean).join(' · '),
        };
      }),
    };
  }

  albums.sort((a, b) => String(a.release_date).localeCompare(String(b.release_date)) || a.name.localeCompare(b.name));
  const latestCover = [...albums].reverse().find((album) => album.cover)?.cover || '';
  return {
    catalog: {
      catalog_version: CATALOG_VERSION,
      source: 'MusicBrainz / Cover Art Archive',
      generated_at: new Date().toISOString(),
      group: { name: artist.name, korean_name: artist.korean_name || '', company: artist.company || '', debut_date: artist.debut_date || '', cover: latestCover },
      albums,
    },
    versions: {
      catalog_version: CATALOG_VERSION,
      artist: artist.name,
      generated_at: new Date().toISOString(),
      source: `https://musicbrainz.org/artist/${artist.musicbrainz_artist_id}`,
      policy: { default_collection_status: 'missing', barcode: 'verified numeric MusicBrainz barcode only', version_cover_fallback: 'album/release-group cover when no release-specific front art is available' },
      releases: versionReleases,
    },
  };
}

async function syncArtist(artist, options) {
  if (options.ifMissing && !options.force && await hasImportMarker(artist.slug)) {
    console.log(`[catalog] ${artist.name}: already imported, skipping.`);
    return { slug: artist.slug, skipped: true };
  }
  console.log(`[catalog] ${artist.name}: reading MusicBrainz…`);
  const releases = await browseReleases(artist.musicbrainz_artist_id);
  const built = buildCatalog(artist, releases);
  if (!built.catalog.albums.length) throw new Error(`${artist.name}: no physical album/EP/single releases were found.`);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const catalogPath = path.join(CACHE_DIR, `${artist.slug}-catalog.json`);
  const versionsPath = path.join(CACHE_DIR, `${artist.slug}-versions.json`);
  fs.writeFileSync(catalogPath, `${JSON.stringify(built.catalog, null, 2)}\n`);
  fs.writeFileSync(versionsPath, `${JSON.stringify(built.versions, null, 2)}\n`);
  const result = await importCatalog({ slug: artist.slug, catalogPath, versionsPath, dbPath: DB_PATH, force: options.force });
  const versionCount = Object.values(built.versions.releases).reduce((sum, release) => sum + release.versions.length, 0);
  const trackCount = built.catalog.albums.reduce((sum, album) => sum + album.discs.reduce((n, disc) => n + disc.tracks.length, 0), 0);
  console.log(`[catalog] ${artist.name}: ${built.catalog.albums.length} physical releases / ${versionCount} versions / ${trackCount} tracks.`);
  return { slug: artist.slug, albums: built.catalog.albums.length, versions: versionCount, tracks: trackCount, imported: result };
}

async function main() {
  const options = args(process.argv);
  if (process.env.CI && !options.force) {
    console.log('[catalog] CI detected; live MusicBrainz sync is skipped.');
    return;
  }
  const registry = readJson(REGISTRY_PATH);
  let artists = registry.artists || [];
  if (options.only.length) artists = artists.filter((artist) => options.only.includes(artist.slug) || options.only.includes(artist.name));
  const failures = [];
  for (const artist of artists) {
    try { await syncArtist(artist, options); }
    catch (error) {
      failures.push({ artist: artist.name, error: error.message });
      console.error(`[catalog] ${artist.name}: ${error.message}`);
      if (!options.bestEffort) throw error;
    }
  }
  if (failures.length) {
    console.warn(`[catalog] ${failures.length} artist(s) could not be synced. Existing catalog data was left untouched.`);
    if (!options.bestEffort) process.exitCode = 1;
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { buildCatalog, isRelevantRelease, versionBaseName, validBarcode };

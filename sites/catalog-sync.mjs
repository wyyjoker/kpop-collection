import registry from '../public/data/catalog-registry.json' with { type: 'json' };
import { all, fail, first, statement } from './data.mjs';

const MUSICBRAINZ = 'https://musicbrainz.org/ws/2';
const CATALOG_VERSION = 1;
const RATE_LIMIT_MS = 1150;
const EXCLUDED_SECONDARY = new Set(['Live', 'Remix', 'Soundtrack', 'DJ-mix', 'Interview', 'Spokenword']);
const ALLOWED_PRIMARY = new Set(['Album', 'EP', 'Single']);
const VIDEO_ONLY = /DVD|Blu-ray|VHS|VCD|LaserDisc/i;
const DIGITAL_ONLY = /^Digital Media$/i;
let lastMusicBrainzRequest = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const compact = value => String(value ?? '').trim();

function mediaFormats(release) {
  return (release.media || []).map(item => compact(item.format)).filter(Boolean);
}
function isPhysical(release) {
  return mediaFormats(release).some(format => !DIGITAL_ONLY.test(format));
}
export function isRelevantRelease(release) {
  if (release.status && release.status !== 'Official') return false;
  const group = release['release-group'] || {};
  if (!ALLOWED_PRIMARY.has(group['primary-type'])) return false;
  const secondary = new Set(group['secondary-types'] || []);
  for (const value of EXCLUDED_SECONDARY) if (secondary.has(value)) return false;
  return isPhysical(release);
}
function audioMedia(release) {
  const physical = (release.media || []).filter(item => item.format && !DIGITAL_ONLY.test(item.format));
  const audio = physical.filter(item => !VIDEO_ONLY.test(item.format));
  return audio.length ? audio : physical;
}
function trackCount(release) {
  return audioMedia(release).reduce((sum, medium) => sum + (medium.tracks || []).length, 0);
}
function canonicalScore(release) {
  let score = trackCount(release) * 10;
  if (release.country === 'KR') score += 500;
  else if (release.country === 'JP') score += 350;
  else if (release.country === 'XW') score += 150;
  if (mediaFormats(release).some(format => /^CD$/i.test(format))) score += 100;
  if (release['cover-art-archive']?.front) score += 40;
  return score;
}
function coverFor(release) {
  return release?.['cover-art-archive']?.front ? `https://coverartarchive.org/release/${release.id}/front-500` : '';
}
export function validBarcode(value) {
  const normalized = compact(value).replace(/\s+/g, '');
  return /^\d{8,14}$/.test(normalized) ? normalized : '';
}
function catalogNumbers(release) {
  const values = [];
  for (const info of release['label-info'] || []) if (info['catalog-number']) values.push(info['catalog-number']);
  return [...new Set(values)].join(' / ');
}
function cleanSuffix(base, title) {
  const a = compact(base), b = compact(title);
  if (!b || b.toLowerCase() === a.toLowerCase()) return '';
  if (b.toLowerCase().startsWith(a.toLowerCase())) {
    let rest = b.slice(a.length).trim().replace(/^[-–—:]\s*/, '').trim();
    const wrapped = rest.match(/^\((.*)\)$/) || rest.match(/^\[(.*)\]$/);
    if (wrapped) rest = wrapped[1].trim();
    if (rest) return rest;
  }
  return b;
}
export function versionBaseName(groupTitle, release) {
  const suffix = cleanSuffix(groupTitle, release.title);
  if (suffix) return suffix;
  if (release.disambiguation) return compact(release.disambiguation);
  const format = mediaFormats(release).filter(value => !DIGITAL_ONLY.test(value)).join(' + ') || 'Physical';
  return `${format}${release.country ? ` · ${release.country}` : ''}`;
}
function uniqueVersionNames(groupTitle, releases) {
  const used = new Map();
  return releases.map(release => {
    let name = versionBaseName(groupTitle, release) || 'Standard Edition';
    const key = name.toLowerCase(), seen = used.get(key) || 0;
    used.set(key, seen + 1);
    if (seen) {
      const country = release.country || 'INTL', barcode = validBarcode(release.barcode), catalog = catalogNumbers(release);
      name = `${name} · ${country}${barcode ? ` · ${barcode}` : catalog ? ` · ${catalog}` : ` · ${seen + 1}`}`;
    }
    return name;
  });
}
function releaseTracks(release) {
  return audioMedia(release).map((medium, index) => ({
    disc: index + 1,
    tracks: (medium.tracks || []).map(track => ({ title: compact(track.title || track.recording?.title || `Track ${track.position || ''}`) })),
  })).filter(disc => disc.tracks.length);
}
function typeLabel(group) {
  const secondary = group['secondary-types'] || [];
  return [group['primary-type'], ...secondary.filter(value => !EXCLUDED_SECONDARY.has(value))].filter(Boolean).join(' · ');
}
function earliestDate(releases, fallback = '') {
  return releases.map(item => item.date).filter(Boolean).sort()[0] || fallback || '';
}

export function buildArtistCatalog(artist, releases) {
  const grouped = new Map();
  for (const release of releases.filter(isRelevantRelease)) {
    const releaseGroup = release['release-group'];
    if (!releaseGroup?.id) continue;
    if (!grouped.has(releaseGroup.id)) grouped.set(releaseGroup.id, { releaseGroup, releases: [] });
    grouped.get(releaseGroup.id).releases.push(release);
  }
  const albums = [];
  for (const { releaseGroup, releases: physicalReleases } of grouped.values()) {
    physicalReleases.sort((a, b) => canonicalScore(b) - canonicalScore(a) || compact(a.date).localeCompare(compact(b.date)));
    const canonical = physicalReleases[0], artRelease = physicalReleases.find(item => item['cover-art-archive']?.front) || canonical;
    const name = compact(releaseGroup.title || canonical.title), releaseDate = compact(releaseGroup['first-release-date'] || earliestDate(physicalReleases));
    const discs = releaseTracks(canonical);
    if (!name || !discs.length) continue;
    const names = uniqueVersionNames(name, physicalReleases);
    albums.push({
      name,
      release_date: releaseDate,
      album_type: typeLabel(releaseGroup) || 'Physical Release',
      cover: coverFor(artRelease),
      notes: `MusicBrainz release group ${releaseGroup.id}`,
      discs,
      versions: physicalReleases.map((release, index) => {
        const formats = mediaFormats(release).filter(value => !DIGITAL_ONLY.test(value));
        return {
          version_name: names[index],
          edition_type: `${formats.join(' + ') || 'Physical'}${release.country ? ` · ${release.country}` : ''}`,
          barcode: validBarcode(release.barcode),
          cover: coverFor(release) || coverFor(artRelease),
          note: [catalogNumbers(release) ? `Catalog: ${catalogNumbers(release)}` : '', release.date ? `Release: ${release.date}` : '', `MusicBrainz: ${release.id}`].filter(Boolean).join(' · '),
        };
      }),
    });
  }
  albums.sort((a, b) => a.release_date.localeCompare(b.release_date) || a.name.localeCompare(b.name));
  return { artist, albums };
}

async function mb(pathname, fetchImpl = fetch, attempt = 0) {
  const wait = Math.max(0, RATE_LIMIT_MS - (Date.now() - lastMusicBrainzRequest));
  if (wait) await sleep(wait);
  lastMusicBrainzRequest = Date.now();
  const response = await fetchImpl(`${MUSICBRAINZ}${pathname}`, { headers: { Accept: 'application/json', 'User-Agent': 'kpop-collection-sites/0.5 (github.com/wyyjoker/kpop-collection)' } });
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await sleep(1500 * (attempt + 1));
    return mb(pathname, fetchImpl, attempt + 1);
  }
  if (!response.ok) fail(`MusicBrainz 暂时不可用（${response.status}），请稍后重试。`, 502);
  return response.json();
}
async function browseReleases(artistId, fetchImpl = fetch) {
  const releases = [];
  let offset = 0;
  for (;;) {
    const query = new URLSearchParams({ artist: artistId, inc: 'release-groups+media+recordings+labels', fmt: 'json', limit: '100', offset: String(offset) });
    const data = await mb(`/release?${query.toString()}`, fetchImpl);
    const page = data.releases || [];
    releases.push(...page);
    offset += page.length;
    if (!page.length || offset >= Number(data['release-count'] || 0)) break;
    if (offset >= 1000) fail('该团体的 MusicBrainz 实体发行记录异常过多，已停止同步。', 409);
  }
  return releases;
}
function replaceableRemoteCover(current) {
  return !compact(current) || /^https:\/\/coverartarchive\.org\//i.test(current);
}
async function ensureGroup(db, artist, cover) {
  let row = await first(db, 'SELECT * FROM groups WHERE name=? COLLATE NOCASE', [artist.name]);
  if (!row) return statement(db, 'INSERT INTO groups (name,korean_name,debut_date,company,cover,logo) VALUES (?,?,?,?,?,?) RETURNING *', [artist.name, artist.korean_name || '', artist.debut_date || '', artist.company || '', cover || '', '']).first();
  await statement(db, `UPDATE groups SET
    korean_name=CASE WHEN TRIM(COALESCE(korean_name,''))='' THEN ? ELSE korean_name END,
    debut_date=CASE WHEN TRIM(COALESCE(debut_date,''))='' THEN ? ELSE debut_date END,
    company=CASE WHEN TRIM(COALESCE(company,''))='' THEN ? ELSE company END,
    cover=CASE WHEN TRIM(COALESCE(cover,''))='' OR cover LIKE 'https://coverartarchive.org/%' THEN ? ELSE cover END
    WHERE id=?`, [artist.korean_name || '', artist.debut_date || '', artist.company || '', cover || '', row.id]).run();
  return first(db, 'SELECT * FROM groups WHERE id=?', [row.id]);
}
async function ensureAlbum(db, groupId, album) {
  let row = await first(db, 'SELECT * FROM albums WHERE group_id=? AND name=? COLLATE NOCASE AND release_date=?', [groupId, album.name, album.release_date]);
  if (!row) return statement(db, 'INSERT INTO albums (group_id,name,korean_name,release_date,album_type,cover,notes) VALUES (?,?,?,?,?,?,?) RETURNING *', [groupId, album.name, '', album.release_date, album.album_type, album.cover, album.notes]).first();
  await statement(db, `UPDATE albums SET
    album_type=CASE WHEN TRIM(COALESCE(album_type,''))='' THEN ? ELSE album_type END,
    cover=CASE WHEN TRIM(COALESCE(cover,''))='' OR cover LIKE 'https://coverartarchive.org/%' THEN ? ELSE cover END,
    notes=CASE WHEN TRIM(COALESCE(notes,''))='' THEN ? ELSE notes END
    WHERE id=?`, [album.album_type, album.cover, album.notes, row.id]).run();
  return first(db, 'SELECT * FROM albums WHERE id=?', [row.id]);
}
async function syncTracks(db, slug, albumId, discs) {
  await statement(db, 'DELETE FROM album_tracks WHERE album_id=? AND source LIKE ?', [albumId, `${slug}-catalog-v%`]).run();
  let count = 0;
  for (const disc of discs) for (let index = 0; index < disc.tracks.length; index += 1) {
    const title = compact(disc.tracks[index]?.title);
    if (!title) continue;
    await statement(db, 'INSERT OR IGNORE INTO album_tracks (album_id,disc_no,track_no,title,note,source) VALUES (?,?,?,?,?,?)', [albumId, Number(disc.disc || 1), index + 1, title, '', `${slug}-catalog-v${CATALOG_VERSION}`]).run();
    count += 1;
  }
  return count;
}
async function syncVersions(db, albumId, versions) {
  let count = 0;
  for (const version of versions) {
    let row = await first(db, 'SELECT * FROM album_versions WHERE album_id=? AND version_name=? COLLATE NOCASE', [albumId, version.version_name]);
    if (!row) row = await statement(db, 'INSERT INTO album_versions (album_id,version_name,cover,barcode,edition_type) VALUES (?,?,?,?,?) RETURNING *', [albumId, version.version_name, version.cover, version.barcode, version.edition_type]).first();
    else {
      await statement(db, `UPDATE album_versions SET
        cover=CASE WHEN TRIM(COALESCE(cover,''))='' OR cover LIKE 'https://coverartarchive.org/%' THEN ? ELSE cover END,
        barcode=CASE WHEN TRIM(COALESCE(barcode,''))='' THEN ? ELSE barcode END,
        edition_type=CASE WHEN TRIM(COALESCE(edition_type,''))='' THEN ? ELSE edition_type END
        WHERE id=?`, [version.cover, version.barcode, version.edition_type, row.id]).run();
    }
    await statement(db, "INSERT OR IGNORE INTO collection (album_version_id,status,quantity) VALUES (?,'missing',0)", [row.id]).run();
    count += 1;
  }
  return count;
}
async function markImport(db, key, count) {
  await statement(db, 'INSERT INTO catalog_imports (catalog_key,item_count) VALUES (?,?) ON CONFLICT(catalog_key) DO UPDATE SET imported_at=CURRENT_TIMESTAMP,item_count=excluded.item_count', [key, count]).run();
}

export async function catalogStatus(db) {
  const imports = await all(db, "SELECT catalog_key,imported_at,item_count FROM catalog_imports WHERE catalog_key LIKE '%-catalog-v%' OR catalog_key LIKE '%-versions-v%'");
  const markers = new Map(imports.map(row => [row.catalog_key, row]));
  const groupRows = await all(db, `SELECT g.name,COUNT(DISTINCT a.id) albums,COUNT(DISTINCT v.id) versions
    FROM groups g LEFT JOIN albums a ON a.group_id=g.id LEFT JOIN album_versions v ON v.album_id=a.id GROUP BY g.id`);
  const counts = new Map(groupRows.map(row => [String(row.name).toLowerCase(), row]));
  return {
    registry_version: registry.registry_version,
    catalog_version: CATALOG_VERSION,
    artists: registry.artists.map(artist => {
      const catalog = markers.get(`${artist.slug}-catalog-v${CATALOG_VERSION}`), versions = markers.get(`${artist.slug}-versions-v${CATALOG_VERSION}`), current = counts.get(artist.name.toLowerCase());
      return { slug: artist.slug, name: artist.name, synced: Boolean(catalog && versions), imported_at: versions?.imported_at || catalog?.imported_at || '', albums: Number(current?.albums || 0), versions: Number(current?.versions || 0) };
    }),
  };
}

export async function syncCatalogArtist(db, slug, { force = false, fetchImpl = fetch } = {}) {
  const artist = registry.artists.find(item => item.slug === slug);
  if (!artist) fail('不支持这个团体的资料库同步。', 404);
  const catalogKey = `${slug}-catalog-v${CATALOG_VERSION}`, versionsKey = `${slug}-versions-v${CATALOG_VERSION}`;
  if (!force && await first(db, 'SELECT catalog_key FROM catalog_imports WHERE catalog_key=?', [catalogKey]) && await first(db, 'SELECT catalog_key FROM catalog_imports WHERE catalog_key=?', [versionsKey])) {
    return { slug, name: artist.name, skipped: true };
  }
  const releases = await browseReleases(artist.musicbrainz_artist_id, fetchImpl);
  const built = buildArtistCatalog(artist, releases);
  if (!built.albums.length) fail(`${artist.name} 没有找到可导入的实体 Album / EP / Single。`, 404);
  const latestCover = [...built.albums].reverse().find(album => album.cover)?.cover || '';
  const group = await ensureGroup(db, artist, latestCover);
  let tracks = 0, versions = 0;
  for (const album of built.albums) {
    const row = await ensureAlbum(db, group.id, album);
    tracks += await syncTracks(db, slug, row.id, album.discs);
    versions += await syncVersions(db, row.id, album.versions);
  }
  await markImport(db, catalogKey, built.albums.length);
  await markImport(db, versionsKey, versions);
  return { slug, name: artist.name, skipped: false, albums: built.albums.length, versions, tracks, source_releases: releases.length };
}

export { registry };

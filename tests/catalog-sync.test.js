const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCatalog, isRelevantRelease, versionBaseName, validBarcode } = require('../scripts/sync-curated-catalogs');

function release(overrides = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'TEST ALBUM (Pink Ver.)',
    status: 'Official',
    country: 'KR',
    date: '2026-01-01',
    barcode: '8801234567890',
    disambiguation: '',
    'cover-art-archive': { front: true },
    'label-info': [{ 'catalog-number': 'CAT001' }],
    'release-group': {
      id: '22222222-2222-2222-2222-222222222222',
      title: 'TEST ALBUM',
      'primary-type': 'EP',
      'secondary-types': [],
      'first-release-date': '2026-01-01',
    },
    media: [{ format: 'CD', tracks: [{ position: 1, title: 'First Song' }, { position: 2, title: 'Second Song' }] }],
    ...overrides,
  };
}

test('MusicBrainz catalog sync keeps physical editions and rejects digital/live noise', () => {
  assert.equal(isRelevantRelease(release()), true);
  assert.equal(isRelevantRelease(release({ media: [{ format: 'Digital Media', tracks: [] }] })), false);
  assert.equal(isRelevantRelease(release({ 'release-group': { ...release()['release-group'], 'secondary-types': ['Live'] } })), false);
  assert.equal(validBarcode('8801234567890'), '8801234567890');
  assert.equal(validBarcode('not-a-barcode'), '');
  assert.equal(versionBaseName('TEST ALBUM', release()), 'Pink Ver.');
});

test('MusicBrainz catalog builder emits tracks, independent cover, barcode and physical versions', () => {
  const base = release();
  const second = release({
    id: '33333333-3333-3333-3333-333333333333',
    title: 'TEST ALBUM (Blue Ver.)',
    barcode: '8801234567891',
    'cover-art-archive': { front: true },
    'label-info': [{ 'catalog-number': 'CAT002' }],
  });
  const { catalog, versions } = buildCatalog({ name: 'TEST', korean_name: '테스트', company: 'Label', debut_date: '2026-01-01' }, [base, second]);
  assert.equal(catalog.albums.length, 1);
  assert.equal(catalog.albums[0].name, 'TEST ALBUM');
  assert.equal(catalog.albums[0].discs[0].tracks.length, 2);
  assert.match(catalog.albums[0].cover, /coverartarchive\.org\/release\//);
  const releaseEntry = Object.values(versions.releases)[0];
  assert.equal(releaseEntry.album_name, 'TEST ALBUM');
  assert.equal(releaseEntry.release_date, '2026-01-01');
  const physical = releaseEntry.versions;
  assert.equal(physical.length, 2);
  assert.deepEqual(physical.map((v) => v.version_name), ['Pink Ver.', 'Blue Ver.']);
  assert.deepEqual(physical.map((v) => v.barcode), ['8801234567890', '8801234567891']);
  assert.ok(physical.every((v) => /CD · KR/.test(v.edition_type)));
  assert.ok(physical.every((v) => /front-500/.test(v.cover)));
});

test('same-title release groups keep separate version catalogs instead of overwriting each other', () => {
  const ep = release();
  const single = release({
    id: '44444444-4444-4444-4444-444444444444',
    title: 'TEST ALBUM (Single Ver.)',
    date: '2027-02-02',
    barcode: '8801234567892',
    'release-group': {
      id: '55555555-5555-5555-5555-555555555555',
      title: 'TEST ALBUM',
      'primary-type': 'Single',
      'secondary-types': [],
      'first-release-date': '2027-02-02',
    },
  });
  const { catalog, versions } = buildCatalog({ name: 'TEST' }, [ep, single]);
  assert.equal(catalog.albums.length, 2);
  assert.deepEqual(catalog.albums.map((album) => album.release_date), ['2026-01-01', '2027-02-02']);
  const entries = Object.values(versions.releases);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((entry) => entry.release_date).sort(), ['2026-01-01', '2027-02-02']);
  assert.ok(entries.every((entry) => entry.album_name === 'TEST ALBUM'));
});

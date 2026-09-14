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
  const physical = versions.releases['TEST ALBUM'].versions;
  assert.equal(physical.length, 2);
  assert.deepEqual(physical.map((v) => v.version_name), ['Pink Ver.', 'Blue Ver.']);
  assert.deepEqual(physical.map((v) => v.barcode), ['8801234567890', '8801234567891']);
  assert.ok(physical.every((v) => /CD · KR/.test(v.edition_type)));
  assert.ok(physical.every((v) => /front-500/.test(v.cover)));
});

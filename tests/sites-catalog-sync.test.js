const test = require('node:test');
const assert = require('node:assert/strict');

function release(overrides = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'CLOUD ALBUM (Pink Ver.)',
    status: 'Official',
    country: 'KR',
    date: '2026-01-01',
    barcode: '8801234567890',
    disambiguation: '',
    'cover-art-archive': { front: true },
    'label-info': [{ 'catalog-number': 'CAT-CLOUD-1' }],
    'release-group': {
      id: '22222222-2222-2222-2222-222222222222',
      title: 'CLOUD ALBUM',
      'primary-type': 'EP',
      'secondary-types': [],
      'first-release-date': '2026-01-01',
    },
    media: [{ format: 'CD', tracks: [{ position: 1, title: 'Cloud One' }, { position: 2, title: 'Cloud Two' }] }],
    ...overrides,
  };
}

test('Sites catalog sync shares the 14-group registry and builds physical version metadata', async () => {
  const { buildArtistCatalog, isRelevantRelease, validBarcode, registry } = await import('../sites/catalog-sync.mjs');
  assert.equal(registry.artists.length, 14);
  for (const name of ['TOMORROW X TOGETHER','EXO','ILLIT','NMIXX','ENHYPEN','Red Velvet','Hearts2Hearts','TWICE','LE SSERAFIM','aespa','RESCENE','ITZY','BLACKPINK','KiiiKiii']) {
    assert.ok(registry.artists.some(artist => artist.name === name), `missing ${name}`);
  }
  assert.equal(isRelevantRelease(release()), true);
  assert.equal(isRelevantRelease(release({ media: [{ format: 'Digital Media', tracks: [] }] })), false);
  assert.equal(validBarcode('8801234567890'), '8801234567890');
  assert.equal(validBarcode('CAT-CLOUD-1'), '');

  const second = release({
    id: '33333333-3333-3333-3333-333333333333',
    title: 'CLOUD ALBUM (Blue Ver.)',
    barcode: '8801234567891',
  });
  const built = buildArtistCatalog({ name: 'CLOUD GROUP' }, [release(), second]);
  assert.equal(built.albums.length, 1);
  assert.equal(built.albums[0].release_date, '2026-01-01');
  assert.deepEqual(built.albums[0].discs[0].tracks.map(track => track.title), ['Cloud One', 'Cloud Two']);
  assert.deepEqual(built.albums[0].versions.map(version => version.version_name), ['Pink Ver.', 'Blue Ver.']);
  assert.deepEqual(built.albums[0].versions.map(version => version.barcode), ['8801234567890', '8801234567891']);
  assert.ok(built.albums[0].versions.every(version => /coverartarchive\.org\/release\//.test(version.cover)));
});

test('same-title release groups remain separate by release-group identity and date', async () => {
  const { buildArtistCatalog } = await import('../sites/catalog-sync.mjs');
  const first = release();
  const second = release({
    id: '44444444-4444-4444-4444-444444444444',
    date: '2027-01-01',
    'release-group': {
      ...release()['release-group'],
      id: '55555555-5555-5555-5555-555555555555',
      'first-release-date': '2027-01-01',
    },
  });
  const built = buildArtistCatalog({ name: 'CLOUD GROUP' }, [first, second]);
  assert.equal(built.albums.length, 2);
  assert.deepEqual(built.albums.map(album => album.release_date), ['2026-01-01', '2027-01-01']);
});

require('dotenv').config();

const path = require('path');
const { importCatalog } = require('./import-catalog');

const ROOT = path.resolve(__dirname, '..');

importCatalog({
  slug: 'seventeen',
  catalogPath: path.join(ROOT, 'public', 'data', 'seventeen-catalog.json'),
  versionsPath: path.join(ROOT, 'public', 'data', 'seventeen-versions.json'),
  force: process.argv.includes('--force'),
})
  .then((result) => {
    if (result.skipped) {
      console.log(`SEVENTEEN catalog already imported; skipping -> ${result.dbPath}`);
      return;
    }
    console.log(`Imported SEVENTEEN catalog: ${result.releases} releases, ${result.tracks} tracks, ${result.versions || 'existing'} physical versions -> ${result.dbPath}`);
  })
  .catch((error) => {
    console.error('Failed to seed SEVENTEEN catalog:', error);
    process.exitCode = 1;
  });

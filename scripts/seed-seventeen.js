require('dotenv').config();

const path = require('path');
const { importCatalog } = require('./import-catalog');

const ROOT = path.resolve(__dirname, '..');
const includeVersions = process.argv.includes('--with-versions') || process.env.SEVENTEEN_INCLUDE_VERSIONS === '1';

importCatalog({
  slug: 'seventeen',
  catalogPath: path.join(ROOT, 'public', 'data', 'seventeen-catalog.json'),
  versionsPath: includeVersions ? path.join(ROOT, 'public', 'data', 'seventeen-versions.json') : null,
  force: process.argv.includes('--force'),
})
  .then((result) => {
    if (result.skipped) {
      console.log(`SEVENTEEN catalog already imported; skipping -> ${result.dbPath}`);
      return;
    }
    const versions = includeVersions ? `, ${result.versions || 'existing'} physical versions` : '';
    console.log(`Imported SEVENTEEN catalog: ${result.releases} releases, ${result.tracks} tracks${versions} -> ${result.dbPath}`);
  })
  .catch((error) => {
    console.error('Failed to seed SEVENTEEN catalog:', error);
    process.exitCode = 1;
  });

import fs from 'node:fs/promises';
import path from 'node:path';
// Explicit migration snapshot, never automatically refreshed by production builds.
const root = path.resolve(import.meta.dirname, '..');
const response = await fetch('http://127.0.0.1:3000/api/export');
if (!response.ok) throw new Error(`Local export failed: ${response.status}`);
const snapshot = await response.json();
if (snapshot.format !== 'kpop-collection-backup' || snapshot.schema_version !== 3) throw new Error('Unexpected backup format');
await fs.mkdir(path.join(root, 'sites'), { recursive: true });
await fs.writeFile(path.join(root, 'sites/bootstrap.json'), JSON.stringify(snapshot));
const paths = new Set([
  ...snapshot.data.groups.flatMap(row => [row.cover, row.logo]), ...snapshot.data.albums.map(row => row.cover),
  ...snapshot.data.album_versions.map(row => row.cover), snapshot.data.profile.avatar, snapshot.data.profile.hero_cover,
].filter(value => value?.startsWith('/uploads/')));
const assets = [];
for (const url of paths) {
  const basename = path.basename(url);
  if (url !== `/uploads/${basename}`) throw new Error('Unsafe local image reference');
  const bytes = await fs.readFile(path.join(root, 'public/uploads', basename));
  const type = { '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.svg':'image/svg+xml' }[path.extname(basename).toLowerCase()];
  if (!type) throw new Error('Unsupported image in local collection');
  assets.push({ key: basename, type, base64: bytes.toString('base64') });
}
await fs.writeFile(path.join(root, 'sites/bootstrap-assets.json'), JSON.stringify(assets));
console.log(JSON.stringify({ albums: snapshot.data.albums.length, versions: snapshot.data.album_versions.length, tracks: snapshot.data.album_tracks.length, uploadedImages: assets.length }));

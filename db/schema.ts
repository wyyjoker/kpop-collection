import { sql } from 'drizzle-orm';
import { sqliteTable, integer, text, real, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';

const created = () => text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`);
export const groups = sqliteTable('groups', {
  id: integer('id').primaryKey({ autoIncrement: true }), name: text('name').notNull(),
  korean_name: text('korean_name').default(''), logo: text('logo').default(''), cover: text('cover').default(''),
  debut_date: text('debut_date').default(''), company: text('company').default(''), created_at: created(),
}, t => [uniqueIndex('groups_name_unique').on(sql`${t.name} COLLATE NOCASE`)]);
export const albums = sqliteTable('albums', {
  id: integer('id').primaryKey({ autoIncrement: true }), group_id: integer('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), korean_name: text('korean_name').default(''), release_date: text('release_date').default(''),
  album_type: text('album_type').default(''), cover: text('cover').default(''), notes: text('notes').default(''), created_at: created(),
}, t => [uniqueIndex('albums_release_unique').on(t.group_id, t.name, t.release_date), index('idx_albums_group_id').on(t.group_id), index('idx_albums_release_date').on(t.release_date)]);
export const versions = sqliteTable('album_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }), album_id: integer('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  version_name: text('version_name').notNull(), cover: text('cover').default(''), barcode: text('barcode').default(''), edition_type: text('edition_type').default(''), created_at: created(),
}, t => [uniqueIndex('versions_name_unique').on(t.album_id, t.version_name), index('idx_versions_album_id').on(t.album_id)]);
export const collection = sqliteTable('collection', {
  id: integer('id').primaryKey({ autoIncrement: true }), album_version_id: integer('album_version_id').notNull().references(() => versions.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('missing'), quantity: integer('quantity').notNull().default(0), purchase_date: text('purchase_date').default(''),
  purchase_price: real('purchase_price'), purchase_channel: text('purchase_channel').default(''), purchase_currency: text('purchase_currency').default('CNY'),
  opened: integer('opened').notNull().default(0), notes: text('notes').default(''), created_at: created(), updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [uniqueIndex('collection_version_unique').on(t.album_version_id), index('idx_collection_status').on(t.status),
  check('collection_status_valid', sql`${t.status} IN ('owned','wishlist','missing','preordered')`), check('collection_quantity_valid', sql`${t.quantity} >= 0`), check('collection_opened_valid', sql`${t.opened} IN (0,1)`) ]);
export const tracks = sqliteTable('album_tracks', {
  id: integer('id').primaryKey({ autoIncrement: true }), album_id: integer('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  disc_no: integer('disc_no').notNull().default(1), track_no: integer('track_no').notNull(), title: text('title').notNull(), note: text('note').default(''), source: text('source').default(''), created_at: created(),
}, t => [uniqueIndex('tracks_number_unique').on(t.album_id,t.disc_no,t.track_no), index('idx_album_tracks_album_id').on(t.album_id)]);
export const catalogImports = sqliteTable('catalog_imports', {
  catalog_key: text('catalog_key').primaryKey(), imported_at: text('imported_at').notNull().default(sql`CURRENT_TIMESTAMP`), item_count: integer('item_count').notNull().default(0),
});
export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey(), name: text('name').notNull().default(''), bio: text('bio').notNull().default(''), avatar: text('avatar').notNull().default(''),
  hero_cover: text('hero_cover').notNull().default(''), diary: text('diary').notNull().default(''), favorite_group_ids: text('favorite_group_ids').notNull().default('[]'),
}, t => [check('profile_singleton', sql`${t.id} = 1`)]);
export const siteState = sqliteTable('site_state', { key: text('key').primaryKey(), value: text('value').notNull() });
export const albumPhotos = sqliteTable('album_photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  album_id: integer('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  src: text('src').notNull(), caption: text('caption').notNull().default(''), created_at: created(),
}, t => [uniqueIndex('album_photos_source_unique').on(t.album_id,t.src)]);

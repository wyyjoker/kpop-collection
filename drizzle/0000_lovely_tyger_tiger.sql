CREATE TABLE `albums` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`name` text NOT NULL,
	`korean_name` text DEFAULT '',
	`release_date` text DEFAULT '',
	`album_type` text DEFAULT '',
	`cover` text DEFAULT '',
	`notes` text DEFAULT '',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `albums_release_unique` ON `albums` (`group_id`,`name`,`release_date`);--> statement-breakpoint
CREATE INDEX `idx_albums_group_id` ON `albums` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_albums_release_date` ON `albums` (`release_date`);--> statement-breakpoint
CREATE TABLE `catalog_imports` (
	`catalog_key` text PRIMARY KEY NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collection` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`album_version_id` integer NOT NULL,
	`status` text DEFAULT 'missing' NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`purchase_date` text DEFAULT '',
	`purchase_price` real,
	`purchase_channel` text DEFAULT '',
	`purchase_currency` text DEFAULT 'CNY',
	`opened` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`album_version_id`) REFERENCES `album_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "collection_status_valid" CHECK("collection"."status" IN ('owned','wishlist','missing','preordered')),
	CONSTRAINT "collection_quantity_valid" CHECK("collection"."quantity" >= 0),
	CONSTRAINT "collection_opened_valid" CHECK("collection"."opened" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_version_unique` ON `collection` (`album_version_id`);--> statement-breakpoint
CREATE INDEX `idx_collection_status` ON `collection` (`status`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`korean_name` text DEFAULT '',
	`logo` text DEFAULT '',
	`cover` text DEFAULT '',
	`debut_date` text DEFAULT '',
	`company` text DEFAULT '',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_name_unique` ON `groups` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`avatar` text DEFAULT '' NOT NULL,
	`hero_cover` text DEFAULT '' NOT NULL,
	`diary` text DEFAULT '' NOT NULL,
	`favorite_group_ids` text DEFAULT '[]' NOT NULL,
	CONSTRAINT "profile_singleton" CHECK("profile"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `site_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `album_tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`album_id` integer NOT NULL,
	`disc_no` integer DEFAULT 1 NOT NULL,
	`track_no` integer NOT NULL,
	`title` text NOT NULL,
	`note` text DEFAULT '',
	`source` text DEFAULT '',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_number_unique` ON `album_tracks` (`album_id`,`disc_no`,`track_no`);--> statement-breakpoint
CREATE INDEX `idx_album_tracks_album_id` ON `album_tracks` (`album_id`);--> statement-breakpoint
CREATE TABLE `album_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`album_id` integer NOT NULL,
	`version_name` text NOT NULL,
	`cover` text DEFAULT '',
	`barcode` text DEFAULT '',
	`edition_type` text DEFAULT '',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `versions_name_unique` ON `album_versions` (`album_id`,`version_name`);--> statement-breakpoint
CREATE INDEX `idx_versions_album_id` ON `album_versions` (`album_id`);
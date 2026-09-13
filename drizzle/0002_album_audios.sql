CREATE TABLE `album_audios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`album_id` integer NOT NULL,
	`title` text NOT NULL,
	`src` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `album_audios_source_unique` ON `album_audios` (`album_id`,`src`);
--> statement-breakpoint
CREATE INDEX `idx_album_audios_album_id` ON `album_audios` (`album_id`);

CREATE TABLE `blueprints` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`wp_version` text NOT NULL,
	`size_mb` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_blueprints_owner_name` ON `blueprints` (`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_clients_owner_name` ON `clients` (`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`site_id` text NOT NULL,
	`type` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_operations_owner_created` ON `operations` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_operations_site_created` ON `operations` (`site_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`status` text DEFAULT 'Deploying' NOT NULL,
	`region` text DEFAULT 'US West' NOT NULL,
	`pod` text DEFAULT 'Standard' NOT NULL,
	`wp_version` text DEFAULT '6.8.2' NOT NULL,
	`php_version` text DEFAULT '8.3' NOT NULL,
	`updates` integer DEFAULT 0 NOT NULL,
	`uptime` text DEFAULT '—' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sites_owner_domain` ON `sites` (`owner_id`,`domain`);--> statement-breakpoint
CREATE INDEX `idx_sites_owner_status` ON `sites` (`owner_id`,`status`);--> statement-breakpoint
PRAGMA optimize;

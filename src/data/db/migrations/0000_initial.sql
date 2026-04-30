CREATE TABLE `source_config` (
  `id` text PRIMARY KEY NOT NULL,
  `source` text NOT NULL,
  `instance_key` text NOT NULL,
  `display_name` text NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `auth_mode` text DEFAULT 'token' NOT NULL,
  `credentials_json` text NOT NULL,
  `last_successful_sync_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  UNIQUE(`source`, `instance_key`)
);
--> statement-breakpoint
CREATE INDEX `source_config_source_idx` ON `source_config` (`source`);
--> statement-breakpoint

CREATE TABLE `project` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `shortcut_source_config_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  UNIQUE(`shortcut_source_config_id`),
  FOREIGN KEY (`shortcut_source_config_id`) REFERENCES `source_config` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE TABLE `person` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `github_username` text,
  `slack_username` text,
  `shortcut_user_id` text,
  `shortcut_handle` text,
  `shortcut_username` text,
  `is_me` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE `notification` (
  `id` text PRIMARY KEY NOT NULL,
  `source` text NOT NULL,
  `external_id` text NOT NULL,
  `dedupe_key` text NOT NULL,
  `title` text NOT NULL,
  `body` text,
  `url` text,
  `author_name` text,
  `occurred_at` integer NOT NULL,
  `payload_json` text NOT NULL,
  `project_id` text,
  `from_person_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `project` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`from_person_id`) REFERENCES `person` (`id`) ON DELETE SET NULL,
  UNIQUE(`dedupe_key`),
  UNIQUE(`source`, `external_id`)
);
--> statement-breakpoint
CREATE INDEX `notification_occurred_at_idx` ON `notification` (`occurred_at`);
--> statement-breakpoint

CREATE TABLE `project_github_repo` (
  `project_id` text NOT NULL,
  `repo_full_name` text NOT NULL,
  PRIMARY KEY(`project_id`, `repo_full_name`),
  FOREIGN KEY (`project_id`) REFERENCES `project` (`id`) ON DELETE CASCADE,
  UNIQUE(`repo_full_name`)
);
--> statement-breakpoint

CREATE TABLE `project_slack_channel` (
  `project_id` text NOT NULL,
  `slack_channel_id` text NOT NULL,
  PRIMARY KEY(`project_id`, `slack_channel_id`),
  FOREIGN KEY (`project_id`) REFERENCES `project` (`id`) ON DELETE CASCADE,
  UNIQUE(`slack_channel_id`)
);
--> statement-breakpoint

CREATE TABLE `notification_state` (
  `notification_id` text PRIMARY KEY NOT NULL,
  `is_read` integer DEFAULT 0 NOT NULL,
  `read_at` integer,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`notification_id`) REFERENCES `notification` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint

CREATE TABLE `sync_run` (
  `id` text PRIMARY KEY NOT NULL,
  `source` text NOT NULL,
  `instance_key` text,
  `since_used` text,
  `status` text NOT NULL,
  `started_at` integer NOT NULL,
  `finished_at` integer,
  `fetched_count` integer DEFAULT 0 NOT NULL,
  `upserted_count` integer DEFAULT 0 NOT NULL,
  `archived_count` integer DEFAULT 0 NOT NULL,
  `error_message` text
);
--> statement-breakpoint

CREATE TABLE `work_item` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `source` text NOT NULL,
  `dedupe_key` text NOT NULL,
  `external_id` text,
  `title` text NOT NULL,
  `body` text,
  `url` text,
  `project_id` text,
  `column` text NOT NULL,
  `position` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  UNIQUE(`dedupe_key`),
  FOREIGN KEY (`project_id`) REFERENCES `project` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `work_item_column_position_idx` ON `work_item` (`column`, `position`);
--> statement-breakpoint

CREATE TABLE `archive_notification` (
  `id` text PRIMARY KEY NOT NULL,
  `original_notification_id` text NOT NULL,
  `source` text NOT NULL,
  `external_id` text NOT NULL,
  `dedupe_key` text NOT NULL,
  `title` text NOT NULL,
  `body` text,
  `url` text,
  `author_name` text,
  `occurred_at` integer NOT NULL,
  `payload_json` text NOT NULL,
  `archived_at` integer NOT NULL,
  UNIQUE(`original_notification_id`)
);
--> statement-breakpoint
CREATE INDEX `archive_notification_occurred_at_idx` ON `archive_notification` (`occurred_at`);

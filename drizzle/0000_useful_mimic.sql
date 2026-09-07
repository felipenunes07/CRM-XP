CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`photo` text,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`person_id` text NOT NULL,
	`due_date` text NOT NULL,
	`due_time` text,
	`deadline` integer NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_person` ON `tasks` (`person_id`);
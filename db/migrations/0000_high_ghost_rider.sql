CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"field_name" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_domains" (
	"challenge_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	CONSTRAINT "challenge_domains_challenge_id_domain_id_pk" PRIMARY KEY("challenge_id","domain_id")
);
--> statement-breakpoint
CREATE TABLE "challenge_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"link_type" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_source_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"source_series_id" uuid NOT NULL,
	"source_edition_id" uuid,
	"source_url" text NOT NULL,
	"external_key" text,
	"raw_title" text,
	"raw_payload_json" jsonb,
	"content_hash" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_task_tags" (
	"challenge_id" uuid NOT NULL,
	"task_tag_id" uuid NOT NULL,
	CONSTRAINT "challenge_task_tags_challenge_id_task_tag_id_pk" PRIMARY KEY("challenge_id","task_tag_id")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"description" text,
	"venue_id" uuid,
	"venue_year" integer,
	"source_edition_id" uuid,
	"host_platform" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"official_url" text NOT NULL,
	"timezone" text,
	"timezone_original" text,
	"registration_start" timestamp with time zone,
	"registration_deadline" timestamp with time zone,
	"challenge_start" timestamp with time zone,
	"challenge_end" timestamp with time zone,
	"submission_deadline" timestamp with time zone,
	"evaluation_start" timestamp with time zone,
	"evaluation_end" timestamp with time zone,
	"workshop_date" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"is_manually_created" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_series_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"editions_discovered" integer DEFAULT 0 NOT NULL,
	"records_parsed" integer DEFAULT 0 NOT NULL,
	"records_inserted" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"records_unchanged" integer DEFAULT 0 NOT NULL,
	"records_failed" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"log_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "domains_name_unique" UNIQUE("name"),
	CONSTRAINT "domains_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "field_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"override_value" jsonb NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"old_slug" text NOT NULL,
	"new_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_series_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"venue_id" uuid,
	"adapter_name" text NOT NULL,
	"root_url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"discovery_strategy" text,
	"config_json" jsonb,
	"crawl_interval_hours" integer DEFAULT 24 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_series_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "task_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "task_tags_name_unique" UNIQUE("name"),
	CONSTRAINT "task_tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"homepage_url" text,
	"short_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "challenge_domains" ADD CONSTRAINT "challenge_domains_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_domains" ADD CONSTRAINT "challenge_domains_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_links" ADD CONSTRAINT "challenge_links_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_source_records" ADD CONSTRAINT "challenge_source_records_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_source_records" ADD CONSTRAINT "challenge_source_records_source_series_id_source_series_id_fk" FOREIGN KEY ("source_series_id") REFERENCES "public"."source_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_source_records" ADD CONSTRAINT "challenge_source_records_source_edition_id_source_editions_id_fk" FOREIGN KEY ("source_edition_id") REFERENCES "public"."source_editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_task_tags" ADD CONSTRAINT "challenge_task_tags_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_task_tags" ADD CONSTRAINT "challenge_task_tags_task_tag_id_task_tags_id_fk" FOREIGN KEY ("task_tag_id") REFERENCES "public"."task_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_source_edition_id_source_editions_id_fk" FOREIGN KEY ("source_edition_id") REFERENCES "public"."source_editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_source_series_id_source_series_id_fk" FOREIGN KEY ("source_series_id") REFERENCES "public"."source_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_overrides" ADD CONSTRAINT "field_overrides_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_editions" ADD CONSTRAINT "source_editions_source_series_id_source_series_id_fk" FOREIGN KEY ("source_series_id") REFERENCES "public"."source_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_series" ADD CONSTRAINT "source_series_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_links_challenge_idx" ON "challenge_links" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "challenge_source_records_challenge_idx" ON "challenge_source_records" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "challenge_source_records_series_idx" ON "challenge_source_records" USING btree ("source_series_id");--> statement-breakpoint
CREATE INDEX "challenges_status_idx" ON "challenges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "challenges_venue_idx" ON "challenges" USING btree ("venue_id","venue_year");--> statement-breakpoint
CREATE UNIQUE INDEX "field_overrides_challenge_field_uq" ON "field_overrides" USING btree ("challenge_id","field_name");--> statement-breakpoint
CREATE UNIQUE INDEX "slug_redirects_type_old_uq" ON "slug_redirects" USING btree ("entity_type","old_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "source_editions_series_year_uq" ON "source_editions" USING btree ("source_series_id","year");
CREATE TYPE "public"."event_action" AS ENUM('shown', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."truck_status" AS ENUM('available', 'loaded', 'empty');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('dry_van_53', 'reefer_53', 'flatbed_48', 'full_double', 'torton');--> statement-breakpoint
CREATE TABLE "cities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"country" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"freight_weight" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loads" (
	"id" text PRIMARY KEY NOT NULL,
	"origin_city_id" text NOT NULL,
	"destination_city_id" text NOT NULL,
	"unit_type" "unit_type" NOT NULL,
	"pickup_start" timestamp with time zone NOT NULL,
	"pickup_end" timestamp with time zone NOT NULL,
	"weight_kg" integer NOT NULL,
	"rate_mxn" integer NOT NULL,
	"shipper" text NOT NULL,
	"commodity" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" "event_action" NOT NULL,
	"truck_id" text,
	"load_ids" text[] NOT NULL,
	"rank" integer NOT NULL,
	"score_per_hour" double precision NOT NULL,
	"gain_vs_empty_mxn" double precision NOT NULL,
	"features" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trucks" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_name" text NOT NULL,
	"plate" text NOT NULL,
	"unit_type" "unit_type" NOT NULL,
	"base_city_id" text NOT NULL,
	"current_city_id" text NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"status" "truck_status" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_origin_city_id_cities_id_fk" FOREIGN KEY ("origin_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_destination_city_id_cities_id_fk" FOREIGN KEY ("destination_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_base_city_id_cities_id_fk" FOREIGN KEY ("base_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_current_city_id_cities_id_fk" FOREIGN KEY ("current_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loads_unit_window_idx" ON "loads" USING btree ("unit_type","pickup_end");--> statement-breakpoint
CREATE INDEX "recommendation_events_created_idx" ON "recommendation_events" USING btree ("created_at");
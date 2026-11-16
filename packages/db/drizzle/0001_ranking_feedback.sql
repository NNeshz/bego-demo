CREATE TABLE "model_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "model_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"weights" jsonb NOT NULL,
	"coefficients" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"trained_on" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD COLUMN "decision_id" uuid;--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD COLUMN "policy" text;--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD COLUMN "source" text;--> statement-breakpoint
CREATE INDEX "recommendation_events_decision_idx" ON "recommendation_events" USING btree ("decision_id");
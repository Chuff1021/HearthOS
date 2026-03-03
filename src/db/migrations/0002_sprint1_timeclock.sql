CREATE TABLE "timesheet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_user_id" varchar(255) NOT NULL,
	"clock_in_at" timestamp with time zone NOT NULL,
	"clock_out_at" timestamp with time zone,
	"source" varchar(50) DEFAULT 'tech_app',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_timesheet_entries_org_id" ON "timesheet_entries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_timesheet_entries_tech_user_id" ON "timesheet_entries" USING btree ("tech_user_id");--> statement-breakpoint
CREATE INDEX "idx_timesheet_entries_open_shift" ON "timesheet_entries" USING btree ("org_id","tech_user_id","clock_out_at");
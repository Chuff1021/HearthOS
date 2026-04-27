-- Widen narrow vendor text fields. QB returns variable-length values (phones with
-- extensions, international zips, full state names, long tax ids), and the original
-- bounds were too tight.
ALTER TABLE "vendors" ALTER COLUMN "phone" TYPE varchar(50);
--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "phone_alt" TYPE varchar(50);
--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "zip" TYPE varchar(20);
--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "account_number" TYPE varchar(255);
--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "tax_id" TYPE varchar(100);
--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "payment_terms" TYPE varchar(255);

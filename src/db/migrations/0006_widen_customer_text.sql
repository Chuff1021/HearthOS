-- Same widening as vendors: QB customer phones can have extensions or
-- non-US formats that overflow varchar(20).
ALTER TABLE "customers" ALTER COLUMN "phone" TYPE varchar(50);
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "phone_alt" TYPE varchar(50);

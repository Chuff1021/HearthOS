-- QB sometimes returns the full state name ("Missouri") instead of the 2-letter code.
-- Widen vendors.state so the bulk insert doesn't fail on those rows.
ALTER TABLE "vendors" ALTER COLUMN "state" TYPE varchar(50);

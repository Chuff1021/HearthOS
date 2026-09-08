import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.umask(0o077);
const archive = process.env.HEARTHOS_RECOVERY_ARCHIVE;
if (!archive?.endsWith(".dump.enc")) throw new Error("An explicit encrypted recovery archive is required.");
const directory = await mkdtemp(path.join(os.tmpdir(), "hearthos-recovery-"));
const data = path.join(directory, "data");
const port = "55439";
let started = false;
function run(command, args, extra = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...extra });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr}`);
  return result.stdout.trim();
}
function pg(command, args) { return run(`/usr/local/bin/${command}`, args); }
const connection = ["-h", "127.0.0.1", "-p", port, "-d", "hearthos_recovery"];
try {
  const passphrase = run("security", ["find-generic-password", "-a", os.userInfo().username, "-s", "HearthOS Production Backup Encryption", "-w"]);
  const dump = path.join(directory, "recovery.dump");
  run("/usr/local/bin/openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-pass", "env:BACKUP_PASSPHRASE", "-in", archive, "-out", dump], { env: { ...process.env, BACKUP_PASSPHRASE: passphrase } });
  pg("initdb", ["-D", data, "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  pg("pg_ctl", ["-D", data, "-l", path.join(directory, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1 -k ${directory}`, "start"]);
  started = true;
  pg("createdb", ["-h", "127.0.0.1", "-p", port, "hearthos_recovery"]);
  pg("pg_restore", [...connection, "--no-owner", "--no-acl", dump]);
  const snapshot = pg("psql", [...connection, "-At", "-v", "ON_ERROR_STOP=1", "-c", `
    begin read only;
    select json_build_object(
      'customers', (select count(*) from customers),
      'invoices', (select count(*) from invoices),
      'payments', (select count(*) from payments),
      'invoiceTotal', (select sum(total_amount)::text from invoices),
      'invoiceBalance', (select sum(balance)::text from invoices),
      'paymentTotal', (select sum(amount)::text from payments),
      'jobs', (select count(*) from hearth_jobs_store),
      'meeksRequests', (select count(*) from hearth_meeks_jobs_store),
      'projects', (select count(*) from hearth_projects),
      'photos', (select sum(jsonb_array_length(coalesce((case when jsonb_typeof(payload)='string' then (payload#>>'{}')::jsonb else payload end)->'photos','[]'::jsonb))) from hearth_jobs_store)
    );
    rollback;
  `]).split("\n").find((line) => line.startsWith("{"));
  console.log(JSON.stringify({ restored: true, archive, records: JSON.parse(snapshot) }, null, 2));
} finally {
  if (started) pg("pg_ctl", ["-D", data, "stop", "-m", "fast"]);
  await rm(directory, { recursive: true, force: true });
}

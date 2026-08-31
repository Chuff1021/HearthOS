import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const backupDir = process.env.HEARTHOS_BACKUP_DIR || path.join(os.homedir(), "HearthOS-secure-backups");
const pgDump = process.env.PG_DUMP_BIN || "/usr/local/opt/libpq/bin/pg_dump";
const pgRestore = process.env.PG_RESTORE_BIN || "/usr/local/opt/libpq/bin/pg_restore";
const openssl = process.env.OPENSSL_BIN || "/usr/local/bin/openssl";
const keychainService = "HearthOS Production Backup Encryption";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archivePath = path.join(backupDir, `hearthos-production-${stamp}.dump.enc`);
const metadataPath = `${archivePath}.json`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return result.stdout.trim();
}

function databaseEnvironment() {
  const parsed = new URL(databaseUrl);
  return {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: parsed.pathname.replace(/^\//, ""),
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGSSLMODE: parsed.searchParams.get("sslmode") || "require",
  };
}

function getOrCreatePassphrase() {
  const existing = spawnSync("security", ["find-generic-password", "-a", os.userInfo().username, "-s", keychainService, "-w"], {
    encoding: "utf8",
  });
  if (existing.status === 0 && existing.stdout.trim()) return existing.stdout.trim();

  const passphrase = randomBytes(48).toString("base64url");
  run("security", [
    "add-generic-password",
    "-U",
    "-a",
    os.userInfo().username,
    "-s",
    keychainService,
    "-w",
    passphrase,
  ]);
  return passphrase;
}

async function createEncryptedArchive(passphrase) {
  const output = createWriteStream(archivePath, { mode: 0o600 });
  const outputClosed = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
  });
  const dump = spawn(pgDump, ["--format=custom", "--compress=9", "--no-owner", "--no-acl"], {
    env: databaseEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const encrypt = spawn(openssl, [
    "enc",
    "-aes-256-cbc",
    "-pbkdf2",
    "-iter",
    "200000",
    "-salt",
    "-pass",
    "env:HEARTHOS_BACKUP_PASSPHRASE",
  ], {
    env: { ...process.env, HEARTHOS_BACKUP_PASSPHRASE: passphrase },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let dumpError = "";
  let encryptError = "";
  dump.stderr.on("data", (chunk) => { dumpError += chunk; });
  encrypt.stderr.on("data", (chunk) => { encryptError += chunk; });
  dump.stdout.pipe(encrypt.stdin);
  encrypt.stdout.pipe(output);

  const [dumpCode, encryptCode] = await Promise.all([
    new Promise((resolve) => dump.on("close", resolve)),
    new Promise((resolve) => encrypt.on("close", resolve)),
  ]);
  await outputClosed;

  if (dumpCode !== 0 || encryptCode !== 0) {
    await rm(archivePath, { force: true });
    throw new Error(`Backup failed. pg_dump: ${dumpError.trim()} openssl: ${encryptError.trim()}`);
  }
}

async function verifyArchive(passphrase) {
  const verificationPath = path.join(backupDir, `.hearthos-backup-verify-${process.pid}.dump`);
  try {
    run(openssl, [
      "enc",
      "-d",
      "-aes-256-cbc",
      "-pbkdf2",
      "-iter",
      "200000",
      "-pass",
      "env:HEARTHOS_BACKUP_PASSPHRASE",
      "-in",
      archivePath,
      "-out",
      verificationPath,
    ], {
      env: { ...process.env, HEARTHOS_BACKUP_PASSPHRASE: passphrase },
    });
    await chmod(verificationPath, 0o600);
    const restoreOutput = run(pgRestore, ["--list", verificationPath]);
    return restoreOutput.split("\n").filter((line) => line && !line.startsWith(";")).length;
  } finally {
    await rm(verificationPath, { force: true });
  }
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

await mkdir(backupDir, { recursive: true, mode: 0o700 });
await chmod(backupDir, 0o700);
const passphrase = getOrCreatePassphrase();

try {
  await createEncryptedArchive(passphrase);
  const entries = await verifyArchive(passphrase);
  const digest = await sha256(archivePath);
  const commit = run("git", ["rev-parse", "HEAD"]);
  const metadata = {
    createdAt: new Date().toISOString(),
    gitCommit: commit,
    archive: path.basename(archivePath),
    encrypted: true,
    encryption: "AES-256-CBC with PBKDF2 (200,000 iterations)",
    keyStorage: "macOS Keychain",
    sha256: digest,
    archiveEntries: entries,
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
  await chmod(archivePath, 0o600);
  console.log(JSON.stringify({ ok: true, archivePath, metadataPath, sha256: digest, archiveEntries: entries }, null, 2));
} catch (error) {
  await rm(archivePath, { force: true });
  await rm(metadataPath, { force: true });
  throw error;
}

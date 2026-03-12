"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendRunMetadata = appendRunMetadata;
const postgres_1 = __importDefault(require("postgres"));
let sqlClient = null;
let initPromise = null;
function getSql() {
    if (!process.env.DATABASE_URL)
        return null;
    if (!sqlClient) {
        sqlClient = (0, postgres_1.default)(process.env.DATABASE_URL, { prepare: false, max: 2 });
    }
    return sqlClient;
}
async function ensureTable() {
    const sql = getSql();
    if (!sql)
        return;
    if (!initPromise) {
        initPromise = (async () => {
            await sql `
        create table if not exists gabe_run_metadata (
          id bigserial primary key,
          ts timestamptz not null default now(),
          payload jsonb not null
        );
      `;
            await sql `create index if not exists idx_gabe_run_metadata_ts on gabe_run_metadata (ts desc);`;
        })();
    }
    await initPromise;
}
async function appendRunMetadata(payload) {
    const sql = getSql();
    if (!sql)
        return;
    await ensureTable();
    await sql `insert into gabe_run_metadata (payload) values (${JSON.stringify(payload)}::jsonb)`;
}

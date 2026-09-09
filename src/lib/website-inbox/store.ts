import type { Sql } from "postgres";
import type { InboxRecord, parseAction, parseExport } from "./domain";

export function createWebsiteInboxStore(sql: Sql) {
  return {
    async list(orgId: string, source: string, search: string, status: string, offset: number) {
      const match = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      return sql.begin("read only", async transaction => {
        const tx = transaction as unknown as Sql;
        const where = tx`org_id=${orgId} AND source=${source}
          AND (${status}='all' OR status=${status})
          AND (payload->>'name' ILIKE ${match} OR payload->>'email' ILIKE ${match}
            OR payload->>'phone' ILIKE ${match} OR payload->>'subject' ILIKE ${match})`;
        const items = await tx<InboxRecord[]>`SELECT external_id,kind,received_at,payload,status,follow_up_at::text,revision FROM hearth_website_inbox WHERE ${where}
          ORDER BY received_at DESC, external_id LIMIT 50 OFFSET ${offset}`;
        const [count] = await tx`SELECT count(*)::int total FROM hearth_website_inbox WHERE ${where}`;
        const [sync] = await tx`SELECT last_checked_at, last_complete_at FROM hearth_website_inbox_sync WHERE org_id=${orgId} AND source=${source}`;
        return { items, total: count.total as number, sync: sync || null };
      });
    },
    async activity(orgId: string, source: string, id: string) {
      return sql`SELECT a.action_id, a.created_at, a.status, a.follow_up_at::text, a.note,
        concat_ws(' ', u.first_name, u.last_name) actor_name
        FROM hearth_website_inbox_activity a JOIN users u ON u.id=a.employee_id AND u.org_id=a.org_id
        WHERE a.org_id=${orgId} AND a.source=${source} AND a.external_id=${id}
        ORDER BY a.created_at DESC LIMIT 100`;
    },
    async update(orgId: string, source: string, employeeId: string, action: ReturnType<typeof parseAction>) {
      return sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        const [item] = await tx`SELECT * FROM hearth_website_inbox
          WHERE org_id=${orgId} AND source=${source} AND external_id=${action.id} FOR UPDATE`;
        if (!item) return { status: 404 };
        const [previous] = await tx`SELECT *, follow_up_at::text AS follow_up_day FROM hearth_website_inbox_activity WHERE org_id=${orgId} AND source=${source} AND action_id=${action.actionId}`;
        if (previous) {
          const same = previous.external_id === action.id && previous.employee_id === employeeId
            && previous.note === action.note && previous.status === action.status
            && previous.follow_up_day === action.followUpAt;
          return { status: same ? 200 : 409 };
        }
        if (item.revision !== action.revision) return { status: 409 };
        const [employee] = await tx`SELECT id FROM users WHERE id=${employeeId} AND org_id=${orgId} AND is_active=true`;
        if (!employee) return { status: 403 };
        await tx`INSERT INTO hearth_website_inbox_activity
          (org_id,source,external_id,action_id,employee_id,status,follow_up_at,note)
          VALUES (${orgId},${source},${action.id},${action.actionId},${employeeId},${action.status},${action.followUpAt},${action.note})`;
        await tx`UPDATE hearth_website_inbox SET status=${action.status},follow_up_at=${action.followUpAt},revision=revision+1
          WHERE org_id=${orgId} AND source=${source} AND external_id=${action.id}`;
        return { status: 200 };
      });
    },
    async syncPage(orgId: string, source: string, read: (cursor: string | null) => Promise<ReturnType<typeof parseExport>>) {
      return sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        const [lock] = await tx`SELECT pg_try_advisory_xact_lock(hashtextextended(${`${orgId}:${source}:website-inbox`},0)) AS acquired`;
        if (!lock.acquired) return { busy: true, imported: 0, more: true };
        await tx`INSERT INTO hearth_website_inbox_sync (org_id,source) VALUES (${orgId},${source}) ON CONFLICT DO NOTHING`;
        const [state] = await tx`SELECT cursor FROM hearth_website_inbox_sync WHERE org_id=${orgId} AND source=${source} FOR UPDATE`;
        const page = await read(state.cursor);
        if (page.nextCursor && page.nextCursor === state.cursor) throw new Error("Export cursor did not advance");
        let imported = 0;
        for (const item of page.items) {
          const rows = await tx`INSERT INTO hearth_website_inbox (org_id,source,external_id,kind,received_at,payload)
            VALUES (${orgId},${source},${item.id},${item.type},${item.createdAt},${tx.json(item)})
            ON CONFLICT (org_id,source,external_id) DO NOTHING RETURNING external_id`;
          imported += rows.length;
        }
        await tx`UPDATE hearth_website_inbox_sync SET cursor=${page.nextCursor},last_checked_at=now(),
          last_complete_at=CASE WHEN ${page.nextCursor}::text IS NULL THEN now() ELSE last_complete_at END
          WHERE org_id=${orgId} AND source=${source}`;
        return { busy: false, imported, more: Boolean(page.nextCursor) };
      });
    },
  };
}

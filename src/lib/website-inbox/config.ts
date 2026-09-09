import "server-only";
import { uuidPattern } from "./domain";

export function websiteInboxConfig() {
  const orgId = process.env.HEARTHOS_WEBSITE_INBOX_ORG_ID;
  const secret = process.env.HEARTHOS_WEBSITE_INBOX_SECRET;
  if (!orgId || !uuidPattern.test(orgId) || !secret || secret.length < 32) return null;
  // Fixed, reviewed destination; never accept a URL or organization from a browser.
  return { orgId, secret, source: "aarons-website", endpoint: "https://aaronsfireplaceco.com/api/integrations/hearthos/inbox" };
}

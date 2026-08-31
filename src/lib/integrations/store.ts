import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  db,
  integrationConnections,
  oauthStates,
  organizations,
  type Organization,
} from "@/db";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  hashOAuthState,
} from "@/lib/integrations/crypto";

export type IntegrationProvider = "quickbooks" | "square" | "chatwoot";

export function isTenantIntegrationsEnabled() {
  return process.env.MULTITENANT_INTEGRATIONS_ENABLED === "true";
}

export async function createOAuthState(input: {
  provider: IntegrationProvider;
  orgId: string;
  identityId: string;
  redirectPath?: string;
}) {
  const state = randomBytes(32).toString("base64url");
  await db.insert(oauthStates).values({
    stateHash: hashOAuthState(state),
    provider: input.provider,
    orgId: input.orgId,
    identityId: input.identityId,
    redirectPath: input.redirectPath || null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  return state;
}

export async function consumeOAuthState(provider: IntegrationProvider, state: string) {
  const [record] = await db
    .update(oauthStates)
    .set({ consumedAt: new Date() })
    .where(and(
      eq(oauthStates.stateHash, hashOAuthState(state)),
      eq(oauthStates.provider, provider),
      isNull(oauthStates.consumedAt),
      gt(oauthStates.expiresAt, new Date()),
    ))
    .returning();
  return record || null;
}

export async function saveIntegrationConnection(input: {
  orgId: string;
  provider: IntegrationProvider;
  externalAccountId: string;
  externalAccountName?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  connectedByIdentityId?: string | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}) {
  const encryptedAccessToken = encryptIntegrationSecret(input.accessToken);
  const encryptedRefreshToken = input.refreshToken
    ? encryptIntegrationSecret(input.refreshToken)
    : null;
  const [connection] = await db
    .insert(integrationConnections)
    .values({
      orgId: input.orgId,
      provider: input.provider,
      externalAccountId: input.externalAccountId,
      externalAccountName: input.externalAccountName || null,
      status: "connected",
      scopes: input.scopes || [],
      accessTokenEncrypted: encryptedAccessToken,
      refreshTokenEncrypted: encryptedRefreshToken,
      tokenExpiresAt: input.tokenExpiresAt || null,
      connectedByIdentityId: input.connectedByIdentityId || null,
      lastError: null,
      metadata: input.metadata || {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        integrationConnections.orgId,
        integrationConnections.provider,
        integrationConnections.externalAccountId,
      ],
      set: {
        externalAccountName: input.externalAccountName || null,
        status: "connected",
        scopes: input.scopes || [],
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        tokenExpiresAt: input.tokenExpiresAt || null,
        connectedByIdentityId: input.connectedByIdentityId || null,
        lastError: null,
        metadata: input.metadata || {},
        updatedAt: new Date(),
      },
    })
    .returning();
  return connection;
}

export async function getIntegrationConnection(orgId: string, provider: IntegrationProvider) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(and(
      eq(integrationConnections.orgId, orgId),
      eq(integrationConnections.provider, provider),
      eq(integrationConnections.status, "connected"),
    ))
    .limit(1);
  return connection || null;
}

export async function getIntegrationConnectionByExternalAccount(
  provider: IntegrationProvider,
  externalAccountId: string,
) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(and(
      eq(integrationConnections.provider, provider),
      eq(integrationConnections.externalAccountId, externalAccountId),
      eq(integrationConnections.status, "connected"),
    ))
    .limit(1);
  return connection || null;
}

export async function disconnectIntegration(orgId: string, provider: IntegrationProvider) {
  if (!isTenantIntegrationsEnabled()) return;
  await db
    .update(integrationConnections)
    .set({
      status: "disconnected",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(integrationConnections.orgId, orgId),
      eq(integrationConnections.provider, provider),
    ));
}

export async function getQuickBooksCredentials(organization: Organization) {
  if (isTenantIntegrationsEnabled()) {
    const connection = await getIntegrationConnection(organization.id, "quickbooks");
    if (connection?.accessTokenEncrypted && connection.refreshTokenEncrypted) {
      return {
        realmId: connection.externalAccountId,
        accessToken: decryptIntegrationSecret(connection.accessTokenEncrypted),
        refreshToken: decryptIntegrationSecret(connection.refreshTokenEncrypted),
        tokenExpiresAt: connection.tokenExpiresAt,
        source: "tenant_connection" as const,
      };
    }
  }

  if (organization.qbRealmId && organization.qbAccessToken && organization.qbRefreshToken) {
    return {
      realmId: organization.qbRealmId,
      accessToken: organization.qbAccessToken,
      refreshToken: organization.qbRefreshToken,
      tokenExpiresAt: organization.qbTokenExpiresAt,
      source: "legacy_organization" as const,
    };
  }
  return null;
}

export async function getSquareCredentials(organization: Organization) {
  if (isTenantIntegrationsEnabled()) {
    const connection = await getIntegrationConnection(organization.id, "square");
    if (connection?.accessTokenEncrypted) {
      const metadata = connection.metadata && typeof connection.metadata === "object"
        ? connection.metadata as Record<string, unknown>
        : {};
      return {
        merchantId: connection.externalAccountId,
        accessToken: decryptIntegrationSecret(connection.accessTokenEncrypted),
        refreshToken: connection.refreshTokenEncrypted
          ? decryptIntegrationSecret(connection.refreshTokenEncrypted)
          : null,
        locationId: String(metadata.locationId || ""),
        environment: String(metadata.environment || process.env.SQUARE_ENVIRONMENT || "production"),
        source: "tenant_connection" as const,
      };
    }
  }

  if (organization.slug === "default" && process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID) {
    return {
      merchantId: "legacy-default",
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      refreshToken: null,
      locationId: process.env.SQUARE_LOCATION_ID,
      environment: process.env.SQUARE_ENVIRONMENT || "production",
      source: "legacy_environment" as const,
    };
  }
  return null;
}

export async function saveQuickBooksCredentials(input: {
  orgId: string;
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  connectedByIdentityId?: string | null;
}) {
  const expiresAt = new Date(Date.now() + input.expiresIn * 1000);
  if (isTenantIntegrationsEnabled()) {
    await saveIntegrationConnection({
      orgId: input.orgId,
      provider: "quickbooks",
      externalAccountId: input.realmId,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      tokenExpiresAt: expiresAt,
      connectedByIdentityId: input.connectedByIdentityId || null,
      scopes: ["com.intuit.quickbooks.accounting"],
    });
  }

  if (!isTenantIntegrationsEnabled() || process.env.INTEGRATION_DUAL_WRITE_LEGACY !== "false") {
    await db
      .update(organizations)
      .set({
        qbRealmId: input.realmId,
        qbAccessToken: input.accessToken,
        qbRefreshToken: input.refreshToken,
        qbTokenExpiresAt: expiresAt,
        qbConnected: true,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, input.orgId));
  }
}

export async function saveQuickBooksRefresh(input: {
  orgId: string;
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  return saveQuickBooksCredentials(input);
}

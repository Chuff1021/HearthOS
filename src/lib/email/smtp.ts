import nodemailer from "nodemailer";
import dns from "node:dns/promises";
import net from "node:net";

type SendEmailInput = {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

const TRANSIENT_SMTP_CODES = new Set([
  "EBUSY",
  "EAI_AGAIN",
  "ECONNRESET",
  "ECONNECTION",
  "ESOCKET",
  "ETIMEDOUT",
  "ENOTFOUND",
]);

function envValue(key: string) {
  const value = process.env[key] || "";
  return value
    .replace(/\\n/g, "")
    .replace(/\r?\n/g, "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1")
    .trim();
}

export function isSmtpConfigured() {
  return Boolean(envValue("SMTP_HOST") && envValue("SMTP_USER") && process.env.SMTP_PASS !== undefined);
}

export function parseEmailList(value: string | undefined | null) {
  return (value || "")
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function smtpErrorCode(err: unknown) {
  if (!err || typeof err !== "object") return "";
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function isTransientSmtpError(err: unknown) {
  const code = smtpErrorCode(err);
  if (TRANSIENT_SMTP_CODES.has(code)) return true;
  const message = err instanceof Error ? err.message : "";
  return /getaddrinfo|dns|timeout|temporar|socket|connection/i.test(message);
}

function isAuthSmtpError(err: unknown) {
  const code = smtpErrorCode(err);
  if (code === "EAUTH") return true;
  const message = err instanceof Error ? err.message : "";
  return /invalid login|535|auth/i.test(message);
}

function smtpAuthError(err: unknown) {
  const message = err instanceof Error ? err.message : "Yahoo rejected the SMTP login.";
  if (/AUTH005/i.test(message)) {
    return new Error("Yahoo rejected SMTP login: too many bad auth attempts. SMTP_PASS is wrong or empty; wait for Yahoo to clear the temporary lock, then set SMTP_PASS to a Yahoo Mail app password.");
  }
  return new Error(`Yahoo rejected SMTP login. Set SMTP_PASS to a valid Yahoo Mail app password. Original error: ${message}`);
}

async function resolveSmtpConnectHost(smtpHost: string, maxAttempts: number) {
  const configuredIp = envValue("SMTP_HOST_IP");
  if (configuredIp) return configuredIp;
  if (net.isIP(smtpHost)) return smtpHost;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const addresses = await dns.resolve4(smtpHost);
      const address = addresses[0];
      if (!address) throw new Error(`No IPv4 address found for SMTP host ${smtpHost}`);
      return address;
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isTransientSmtpError(err)) throw err;
      await sleep(500 * attempt * attempt);
    }
  }

  throw lastError;
}

export async function sendSmtpEmail(input: SendEmailInput) {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.");
  }

  const port = Number(envValue("SMTP_PORT") || 465);
  const secure = (envValue("SMTP_SECURE") || "true").toLowerCase() !== "false";
  const smtpUser = envValue("SMTP_USER");
  const smtpPass = envValue("SMTP_PASS");
  const fromEmail = envValue("SMTP_FROM") || smtpUser;
  const fromName = envValue("SMTP_FROM_NAME") || "Hearth OS";
  const maxAttempts = Math.max(1, Number(process.env.SMTP_SEND_ATTEMPTS || 4));
  const smtpHost = envValue("SMTP_HOST");
  if (!smtpPass) {
    throw new Error("SMTP_PASS is empty. Set it to a Yahoo Mail app password, not the regular Yahoo account password.");
  }
  const connectHost = await resolveSmtpConnectHost(smtpHost, maxAttempts);

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const transporter = nodemailer.createTransport({
      host: connectHost,
      port,
      secure,
      family: 4,
      dnsTimeout: 15000,
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 45000,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        servername: smtpHost,
      },
    } as any);

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: input.to,
        cc: input.cc?.length ? input.cc : undefined,
        bcc: input.bcc?.length ? input.bcc : undefined,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments,
      });
      transporter.close();
      return;
    } catch (err) {
      transporter.close();
      lastError = err;
      if (isAuthSmtpError(err)) throw smtpAuthError(err);
      if (attempt >= maxAttempts || !isTransientSmtpError(err)) throw err;
      await sleep(750 * attempt * attempt);
    }
  }

  throw lastError;
}

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

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
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

async function resolveSmtpConnectHost(smtpHost: string, maxAttempts: number) {
  const configuredIp = (process.env.SMTP_HOST_IP || "").trim();
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
    throw new Error("SMTP is not configured");
  }

  const port = Number(process.env.SMTP_PORT || 465);
  const secure = (process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || "Hearth OS";
  const maxAttempts = Math.max(1, Number(process.env.SMTP_SEND_ATTEMPTS || 4));
  const smtpHost = String(process.env.SMTP_HOST || "").trim();
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
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
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
      if (attempt >= maxAttempts || !isTransientSmtpError(err)) throw err;
      await sleep(750 * attempt * attempt);
    }
  }

  throw lastError;
}

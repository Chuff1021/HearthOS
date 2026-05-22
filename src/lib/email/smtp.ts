import nodemailer from "nodemailer";

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

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function parseEmailList(value: string | undefined | null) {
  return (value || "")
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function sendSmtpEmail(input: SendEmailInput) {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP is not configured");
  }

  const port = Number(process.env.SMTP_PORT || 465);
  const secure = (process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || "Hearth OS";

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

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
}

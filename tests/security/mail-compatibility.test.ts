import assert from "node:assert/strict";
import { test } from "node:test";
import nodemailer from "nodemailer";

test("upgraded mailer renders invoice-style mail and PDF attachments without sending", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const result = await transport.sendMail({
    from: "office@example.test", to: "customer@example.test", subject: "Test invoice",
    text: "Your test invoice is attached.", html: "<p>Your test invoice is attached.</p>",
    attachments: [{ filename: "invoice.pdf", content: Buffer.from("%PDF-test"), contentType: "application/pdf" }],
  });
  const message = result.message.toString();
  assert.match(message, /Subject: Test invoice/);
  assert.match(message, /application\/pdf/);
  assert.match(message, /invoice.pdf/);
});

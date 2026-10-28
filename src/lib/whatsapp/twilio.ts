import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizeSaPhone } from "@/lib/phone";

/**
 * Twilio signs every webhook: base64(HMAC-SHA1(authToken, url + each POST
 * param as key+value, sorted by key)). The URL must be exactly the one Twilio
 * was configured to call, so behind a proxy set WHATSAPP_WEBHOOK_URL.
 */
export function isValidTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string
): boolean {
  if (!signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "whatsapp:+27821234567" -> "+27821234567", or null if it isn't a SA number. */
export function phoneFromWhatsAppAddress(from: string): string | null {
  return normalizeSaPhone(from.replace(/^whatsapp:/i, ""));
}

// WhatsApp via Twilio rejects bodies over 1600 characters.
const MAX_BODY = 1500;

function chunk(text: string): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > MAX_BODY) {
    let cut = rest.lastIndexOf("\n", MAX_BODY);
    if (cut < MAX_BODY / 2) cut = rest.lastIndexOf(" ", MAX_BODY);
    if (cut < MAX_BODY / 2) cut = MAX_BODY;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Replies by REST rather than TwiML so a slow model call can't hit Twilio's
 * 15s webhook timeout. A reply inside the 24h window after the person's own
 * message needs no approved template, so this works before business approval.
 */
export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    throw new Error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM");
  }

  for (const part of chunk(body)) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: part }),
    });
    if (!res.ok) {
      throw new Error(`Twilio send failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
  }
}

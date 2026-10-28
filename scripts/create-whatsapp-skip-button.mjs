#!/usr/bin/env node
/**
 * One-off: creates the Twilio Content template used for the "No" quick-reply button on the
 * WhatsApp bot's optional questions (the question text is passed in as {{1}}), and prints its SID.
 * Set that SID as WHATSAPP_SKIP_CONTENT_SID in Vercel. Without it the bot sends plain text.
 *
 * Usage: TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... node scripts/create-whatsapp-skip-button.mjs
 */
const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
if (!sid || !token) throw new Error("Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN");

const res = await fetch("https://content.twilio.com/v1/Content", {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    friendly_name: "sa_r2o_optional_question_no",
    language: "en",
    variables: { 1: "Question text" },
    types: { "twilio/quick-reply": { body: "{{1}}", actions: [{ title: "No", id: "no" }] } },
  }),
});
const json = await res.json();
if (!res.ok) throw new Error(`Twilio said ${res.status}: ${JSON.stringify(json)}`);
console.log(`Created. Set WHATSAPP_SKIP_CONTENT_SID=${json.sid}`);

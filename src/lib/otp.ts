import "server-only";

/**
 * Delivery channel for setup/reset OTP codes. Starts on SMS; flip to
 * "whatsapp" once the client's WhatsApp Business API sender is
 * configured with Twilio — no code changes required beyond this env var.
 */
export function getOtpChannel(): "sms" | "whatsapp" {
  return process.env.OTP_CHANNEL === "whatsapp" ? "whatsapp" : "sms";
}

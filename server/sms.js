export function smsReadiness() {
  return Boolean(process.env.SMS_GATEWAY_URL && process.env.SMS_GATEWAY_TOKEN && process.env.SMS_GATEWAY_SENDER);
}

// Provider adapter contract: POST {to, sender, message} with Bearer auth.
// Keep provider-specific credentials in the Coolify secret store.
export async function sendSchoolSms({ to, message }) {
  const endpoint = process.env.SMS_GATEWAY_URL || '';
  const token = process.env.SMS_GATEWAY_TOKEN || '';
  const sender = process.env.SMS_GATEWAY_SENDER || '';
  if (!endpoint || !token || !sender) throw new Error('SMS gateway is not configured.');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') throw new Error('SMS gateway URL must use HTTPS.');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, sender, message }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`SMS gateway returned HTTP ${response.status}.`);
  const result = await response.json().catch(() => ({}));
  return { providerMessageId: String(result.messageId || result.id || '').slice(0, 160) || null };
}

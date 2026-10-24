const ORANGE_API = 'https://api.orange.com';
const LIBERIA_SENDER_ADDRESS = 'tel:+2310000';

let orangeToken = null;

function orangeConfigured() {
  return Boolean(process.env.ORANGE_SMS_CLIENT_ID && process.env.ORANGE_SMS_CLIENT_SECRET);
}

function gatewayConfigured() {
  return Boolean(process.env.SMS_GATEWAY_URL && process.env.SMS_GATEWAY_TOKEN && process.env.SMS_GATEWAY_SENDER);
}

export function smsReadiness() {
  return orangeConfigured() || gatewayConfigured();
}

function normalizeLiberiaNumber(value) {
  let number = String(value || '').replace(/[\s()-]/g, '');
  if (/^0\d{7,10}$/.test(number)) number = `+231${number.slice(1)}`;
  else if (/^231\d{7,10}$/.test(number)) number = `+${number}`;
  if (!/^\+[1-9]\d{7,14}$/.test(number)) throw new Error('SMS recipient must be a valid international phone number.');
  return `tel:${number}`;
}

async function getOrangeToken() {
  if (orangeToken && orangeToken.expiresAt > Date.now() + 30_000) return orangeToken.value;
  const clientId = process.env.ORANGE_SMS_CLIENT_ID || '';
  const clientSecret = process.env.ORANGE_SMS_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) throw new Error('Orange SMS credentials are not configured.');
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${ORANGE_API}/oauth/v3/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Orange SMS authentication returned HTTP ${response.status}.`);
  const result = await response.json().catch(() => ({}));
  if (typeof result.access_token !== 'string' || !result.access_token) throw new Error('Orange SMS authentication did not return an access token.');
  const expiresIn = Math.max(60, Number(result.expires_in) || 3600);
  orangeToken = { value: result.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return orangeToken.value;
}

async function sendWithOrange({ to, message }) {
  const recipient = normalizeLiberiaNumber(to);
  const senderNumber = process.env.ORANGE_SMS_SENDER_NUMBER || LIBERIA_SENDER_ADDRESS;
  if (senderNumber !== LIBERIA_SENDER_ADDRESS && !/^tel:\+231\d{7,10}$/.test(senderNumber)) throw new Error('Orange SMS sender number must use tel:+231 and Liberia number format.');
  const fullText = String(message || '');
  if (!fullText) throw new Error('Orange SMS message cannot be empty.');
  const smsText = Array.from(fullText).length <= 160 ? fullText : `${Array.from(fullText).slice(0, 157).join('').trimEnd()}...`;
  const senderPath = encodeURIComponent(senderNumber);
  const payload = {
    outboundSMSMessageRequest: {
      address: recipient,
      senderAddress: senderNumber,
      outboundSMSTextMessage: { message: smsText },
    },
  };
  const senderName = String(process.env.ORANGE_SMS_SENDER_NAME || '').trim();
  if (senderName) payload.outboundSMSMessageRequest.senderName = senderName;

  const send = async token => fetch(`${ORANGE_API}/smsmessaging/v1/outbound/${senderPath}/requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  let response = await send(await getOrangeToken());
  if (response.status === 401) {
    orangeToken = null;
    response = await send(await getOrangeToken());
  }
  if (!response.ok) throw new Error(`Orange SMS send returned HTTP ${response.status}.`);
  const result = await response.json().catch(() => ({}));
  const resourceUrl = result?.outboundSMSMessageRequest?.resourceURL || response.headers.get('location') || '';
  const providerMessageId = String(resourceUrl).split('/').filter(Boolean).at(-1) || null;
  return { providerMessageId };
}

// Orange Liberia's SMS API reaches all local operators. Keep provider-specific
// secrets server-side; generic gateway support remains available as a fallback.
export async function sendSchoolSms({ to, message }) {
  if (orangeConfigured()) return sendWithOrange({ to, message });

  const endpoint = process.env.SMS_GATEWAY_URL || '';
  const token = process.env.SMS_GATEWAY_TOKEN || '';
  const sender = process.env.SMS_GATEWAY_SENDER || '';
  if (!endpoint || !token || !sender) throw new Error('SMS provider is not configured.');
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

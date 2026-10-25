import { randomUUID } from 'node:crypto';

const ORANGE_API = 'https://api.orange.com';
const MTN_API = 'https://api.mtn.com/v1';
const LIBERIA_SENDER_ADDRESS = 'tel:+2310000';

let orangeToken = null;
let mtnToken = null;

function orangeConfigured() {
  return Boolean(process.env.ORANGE_SMS_CLIENT_ID && process.env.ORANGE_SMS_CLIENT_SECRET);
}

function gatewayConfigured() {
  return Boolean(process.env.SMS_GATEWAY_URL && process.env.SMS_GATEWAY_TOKEN && process.env.SMS_GATEWAY_SENDER);
}

function mtnConfigured() {
  return Boolean(process.env.MTN_SMS_CLIENT_ID && process.env.MTN_SMS_CLIENT_SECRET && process.env.MTN_SMS_SENDER_ADDRESS);
}

function selectedProvider() {
  const configured = String(process.env.SMS_PROVIDER || '').trim().toUpperCase();
  if (configured) return configured;
  // Preserve existing Orange/gateway installations. MTN must be explicitly
  // selected because its SMS endpoint is production and may be chargeable.
  if (orangeConfigured()) return 'ORANGE';
  if (gatewayConfigured()) return 'GATEWAY';
  return 'NONE';
}

export function smsReadiness() {
  const provider = selectedProvider();
  return provider === 'MTN' ? mtnConfigured() && process.env.MTN_SMS_ENABLE_LIVE === 'true' : provider === 'ORANGE' ? orangeConfigured() : provider === 'GATEWAY' ? gatewayConfigured() : false;
}

export function smsProviderName() {
  const provider = selectedProvider();
  return provider === 'MTN' ? 'MTN SMS V2' : provider === 'ORANGE' ? 'Orange SMS' : provider === 'GATEWAY' ? 'SMS gateway' : 'SMS provider';
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

async function getMtnToken() {
  if (mtnToken && mtnToken.expiresAt > Date.now() + 30_000) return mtnToken.value;
  const clientId = process.env.MTN_SMS_CLIENT_ID || '';
  const clientSecret = process.env.MTN_SMS_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) throw new Error('MTN SMS production credentials are not configured.');
  const response = await fetch(`${MTN_API}/oauth/access_token?grant_type=client_credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`MTN SMS authentication returned HTTP ${response.status}.`);
  const result = await response.json().catch(() => ({}));
  if (typeof result.access_token !== 'string' || !result.access_token) throw new Error('MTN SMS authentication did not return an access token.');
  const expiresIn = Math.max(60, Number(result.expires_in) || 3600);
  mtnToken = { value: result.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return mtnToken.value;
}

async function sendWithMtn({ to, message }) {
  const recipient = normalizeLiberiaNumber(to);
  const senderAddress = String(process.env.MTN_SMS_SENDER_ADDRESS || '').trim();
  if (!senderAddress) throw new Error('MTN SMS sender address is not configured.');
  const text = String(message || '');
  if (!text) throw new Error('MTN SMS message cannot be empty.');
  const clientCorrelator = randomUUID();
  const transactionId = randomUUID();
  const send = async token => fetch(`${MTN_API}/messages/sms/outbound`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      transactionId,
    },
    body: JSON.stringify({ senderAddress, receiverAddress: [recipient], message: text, clientCorrelator }),
    signal: AbortSignal.timeout(10000),
  });
  let response = await send(await getMtnToken());
  if (response.status === 401) {
    mtnToken = null;
    response = await send(await getMtnToken());
  }
  if (!response.ok) throw new Error(`MTN SMS send returned HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) throw new Error('MTN SMS returned an unexpected non-JSON response.');
  const result = await response.json().catch(() => null);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('MTN SMS returned an invalid response.');
  const requestId = result?.data?.requestId || result?.transactionId;
  if (!requestId) throw new Error('MTN SMS response did not include a tracking identifier.');
  return { providerMessageId: String(requestId).slice(0, 160) };
}

// Orange Liberia's SMS API reaches all local operators. Keep provider-specific
// secrets server-side; generic gateway support remains available as a fallback.
export async function sendSchoolSms({ to, message }) {
  const provider = selectedProvider();
  if (provider === 'MTN') {
    if (!mtnConfigured()) throw new Error('MTN SMS production credentials and approved sender address are not configured.');
    if (process.env.MTN_SMS_ENABLE_LIVE !== 'true') throw new Error('MTN SMS live sending is disabled. Set MTN_SMS_ENABLE_LIVE=true only after confirming production charges and sender approval.');
    return sendWithMtn({ to, message });
  }
  if (provider === 'ORANGE') {
    if (!orangeConfigured()) throw new Error('Orange SMS credentials are not configured.');
    return sendWithOrange({ to, message });
  }
  if (provider !== 'GATEWAY') throw new Error('SMS provider is not configured.');

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

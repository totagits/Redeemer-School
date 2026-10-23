import { randomUUID } from 'node:crypto';

const SANDBOX_BASE_URL = 'https://sandbox.momodeveloper.mtn.com';
const PRODUCTION_BASE_URL = 'https://proxy.momoapi.mtn.com';
const REQUEST_TIMEOUT_MS = 12_000;

export class MomoProviderError extends Error {
  constructor(message, { status = null, outcomeUnknown = false, code = null } = {}) {
    super(message);
    this.name = 'MomoProviderError';
    this.status = status;
    this.outcomeUnknown = outcomeUnknown;
    this.code = code;
  }
}

export function readMomoConfig(env = process.env) {
  const environment = String(env.MTN_MOMO_ENVIRONMENT || 'SANDBOX').toUpperCase();
  const expectedBaseUrl = environment === 'PRODUCTION' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
  const baseUrl = (env.MTN_MOMO_BASE_URL || expectedBaseUrl).replace(/\/$/, '');
  let validBase = false;
  try {
    const parsed = new URL(baseUrl);
    validBase = parsed.protocol === 'https:' && parsed.origin === expectedBaseUrl;
  } catch {}
  const validEnvironment = ['SANDBOX', 'PRODUCTION'].includes(environment);
  const currency = String(env.MTN_MOMO_CURRENCY || (environment === 'PRODUCTION' ? 'LRD' : 'EUR')).toUpperCase();
  const apiUser = env.MTN_MOMO_API_USER || '';
  const apiKey = env.MTN_MOMO_API_KEY || '';
  const subscriptionKey = env.MTN_MOMO_SUBSCRIPTION_KEY || '';
  const liveEnabled = String(env.MTN_MOMO_ENABLE_LIVE_COLLECTIONS || '').toLowerCase() === 'true';
  const currencyValid = environment === 'SANDBOX' ? currency === 'EUR' : currency === 'LRD';
  const configured = validEnvironment && validBase && Boolean(apiUser && apiKey && subscriptionKey) && currencyValid && (environment !== 'PRODUCTION' || liveEnabled);
  return {
    enabled: configured,
    environment,
    baseUrl,
    targetEnvironment: environment === 'PRODUCTION' ? 'mtnliberia' : 'sandbox',
    currency,
    feeRateBps: 250,
    reason: !validEnvironment || !validBase ? 'MTN MoMo endpoint configuration is invalid.'
      : !currencyValid ? (environment === 'SANDBOX' ? 'MTN MoMo sandbox uses EUR for test transactions.' : 'MTN MoMo Liberia production collections use LRD.')
        : environment === 'PRODUCTION' && !liveEnabled ? 'Live MTN collections are disabled. Complete sandbox acceptance and explicitly enable live collections before switching this environment.'
          : !configured ? 'MTN MoMo Collection API credentials are not configured.' : '',
  };
}

function assertConfigured(config) {
  if (!config.enabled) throw new MomoProviderError(config.reason || 'MTN MoMo is not configured.');
}

async function fetchWithTimeout(fetchImpl, url, options, { outcomeUnknown = false } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    throw new MomoProviderError('MTN MoMo could not be reached. Check the payment status before retrying.', { outcomeUnknown });
  } finally {
    clearTimeout(timeout);
  }
}

export function createMomoClient({ env = process.env, fetchImpl = fetch } = {}) {
  const config = readMomoConfig(env);
  let cachedToken = null;

  async function getToken() {
    assertConfigured(config);
    if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
    const apiUser = env.MTN_MOMO_API_USER;
    const apiKey = env.MTN_MOMO_API_KEY;
    const subscriptionKey = env.MTN_MOMO_SUBSCRIPTION_KEY;
    const authorization = `Basic ${Buffer.from(`${apiUser}:${apiKey}`).toString('base64')}`;
    const response = await fetchWithTimeout(fetchImpl, `${config.baseUrl}/collection/token/`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Ocp-Apim-Subscription-Key': subscriptionKey, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new MomoProviderError('MTN MoMo authentication failed. Verify the Collection API credentials and environment.', { status: response.status });
    const result = await response.json().catch(() => ({}));
    if (typeof result.access_token !== 'string' || !result.access_token) {
      throw new MomoProviderError('MTN MoMo returned an invalid access token response.');
    }
    const expiresInSeconds = Number(result.expires_in) || 300;
    cachedToken = { value: result.access_token, expiresAt: Date.now() + Math.max(60, expiresInSeconds) * 1000 };
    return cachedToken.value;
  }

  async function requestToPay({ referenceId = randomUUID(), externalId, amount, currency = config.currency, msisdn, payerMessage, payeeNote }) {
    assertConfigured(config);
    if (currency !== config.currency) throw new MomoProviderError(`MTN MoMo is configured for ${config.currency} transactions in ${config.environment.toLowerCase()}.`);
    const validMsisdn = config.environment === 'SANDBOX' ? /^\d{10,15}$/.test(msisdn || '') : /^231\d{9}$/.test(msisdn || '');
    if (!validMsisdn) throw new MomoProviderError(config.environment === 'SANDBOX'
      ? 'Enter a 10–15 digit MTN sandbox test number.'
      : 'Enter the payer’s Liberia mobile number in international format, for example 231XXXXXXXXX.');
    const token = await getToken();
    let response;
    try {
      response = await fetchWithTimeout(fetchImpl, `${config.baseUrl}/collection/v1_0/requesttopay`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Ocp-Apim-Subscription-Key': env.MTN_MOMO_SUBSCRIPTION_KEY,
          'X-Target-Environment': config.targetEnvironment,
          'X-Reference-Id': referenceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Number(amount).toFixed(2), currency, externalId,
          payer: { partyIdType: 'MSISDN', partyId: msisdn },
          payerMessage: String(payerMessage || 'Redeemer school fee payment').slice(0, 160),
          payeeNote: String(payeeNote || 'Redeemer school fee payment').slice(0, 160),
        }),
      }, { outcomeUnknown: true });
    } catch (error) {
      if (error instanceof MomoProviderError) throw error;
      throw new MomoProviderError('The payment request outcome is unknown. Check its status before retrying.', { outcomeUnknown: true });
    }
    if (response.status !== 202) {
      let providerDetail = '';
      try {
        const rawBody = typeof response.text === 'function'
          ? await response.text()
          : JSON.stringify(await response.json().catch(() => ({})));
        let body;
        try { body = JSON.parse(rawBody); } catch { body = null; }
        const code = [body?.code, body?.errorCode].find(value => typeof value === 'string' && value.trim());
        const description = [body?.message, body?.error, body?.description].find(value => typeof value === 'string' && value.trim());
        const htmlText = rawBody.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ');
        const plainText = htmlText.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
        const detail = [code, description].filter(Boolean).join(': ') || plainText;
        if (detail) providerDetail = String(detail).replace(/[\r\n\t]+/g, ' ').slice(0, 180);
      } catch {}
      const message = config.environment === 'SANDBOX'
        ? `MTN sandbox rejected the request (HTTP ${response.status}${providerDetail ? `: ${providerDetail}` : ''}). Check the request details and Collections subscription key.`
        : 'MTN MoMo did not accept the payment request. Verify the payer number and MTN account configuration.';
      throw new MomoProviderError(message, {
        status: response.status,
        outcomeUnknown: response.status >= 500,
      });
    }
    return { referenceId, accepted: true, status: 'PENDING' };
  }

  async function getRequestStatus(referenceId) {
    assertConfigured(config);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(referenceId || '')) {
      throw new MomoProviderError('The payment reference is invalid.');
    }
    const token = await getToken();
    const response = await fetchWithTimeout(fetchImpl, `${config.baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Ocp-Apim-Subscription-Key': env.MTN_MOMO_SUBSCRIPTION_KEY,
        'X-Target-Environment': config.targetEnvironment,
      },
    }, { outcomeUnknown: true });
    if (!response.ok) throw new MomoProviderError('MTN MoMo could not confirm payment status. Try checking again shortly.', { status: response.status, outcomeUnknown: true });
    const result = await response.json().catch(() => ({}));
    return {
      status: String(result.status || 'PENDING').toUpperCase(),
      amount: result.amount == null ? null : String(result.amount),
      currency: result.currency == null ? null : String(result.currency).toUpperCase(),
      externalId: result.externalId == null ? null : String(result.externalId),
      financialTransactionId: result.financialTransactionId == null ? null : String(result.financialTransactionId),
      referenceId,
    };
  }

  async function testConnection() {
    assertConfigured(config);
    await getToken();
    return { connected: true, environment: config.environment, currency: config.currency };
  }

  return { config, requestToPay, getRequestStatus, testConnection };
}

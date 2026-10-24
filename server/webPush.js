import { createPrivateKey, createECDH, createCipheriv, createHmac, randomBytes, sign } from 'node:crypto';

const decode = value => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const encode = value => Buffer.from(value).toString('base64url');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
function hkdf(secret, salt, info, length) {
  const prk = hmac(salt, secret);
  const blocks = [];
  let previous = Buffer.alloc(0);
  for (let i = 1; Buffer.concat(blocks).length < length; i += 1) {
    previous = hmac(prk, Buffer.concat([previous, Buffer.from(info), Buffer.from([i])]));
    blocks.push(previous);
  }
  return Buffer.concat(blocks).subarray(0, length);
}

function vapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || '';
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

function vapidToken(endpoint, config) {
  const { hostname } = new URL(endpoint);
  const publicBytes = decode(config.publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new Error('VAPID public key must be an uncompressed P-256 key.');
  const jwk = {
    kty: 'EC', crv: 'P-256', x: encode(publicBytes.subarray(1, 33)), y: encode(publicBytes.subarray(33, 65)),
    d: encode(decode(config.privateKey)),
  };
  const header = encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = encode(JSON.stringify({ aud: `https://${hostname}`, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: config.subject }));
  const unsigned = `${header}.${claims}`;
  const key = createPrivateKey({ key: jwk, format: 'jwk' });
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${encode(signature)}`;
}

export async function sendWebPush(subscription, message) {
  const config = vapidConfig();
  if (!config) return { sent: false, reason: 'Push credentials are not configured.' };
  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== 'https:') return { sent: false, reason: 'Push endpoint must use HTTPS.' };
  const uaPublic = decode(subscription.p256dh);
  const authSecret = decode(subscription.auth_secret);
  if (uaPublic.length !== 65 || authSecret.length < 16) return { sent: false, reason: 'Push subscription keys are invalid.' };

  const server = createECDH('prime256v1');
  server.generateKeys();
  const asPublic = server.getPublicKey();
  const sharedSecret = server.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(sharedSecret, authSecret, keyInfo, 32);
  const salt = randomBytes(16);
  const cek = hkdf(ikm, salt, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = hkdf(ikm, salt, 'Content-Encoding: nonce\0', 12);
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(message)), Buffer.from([2])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4); recordSize.writeUInt32BE(4096);
  const body = Buffer.concat([salt, recordSize, Buffer.from([asPublic.length]), asPublic, encrypted]);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', 'TTL': '86400',
      'Authorization': `vapid t=${vapidToken(endpoint.href, config)}, k=${config.publicKey}`,
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404 || response.status === 410) return { sent: false, expired: true, reason: 'Push subscription expired.' };
  if (!response.ok) return { sent: false, reason: `Push provider returned HTTP ${response.status}.` };
  return { sent: true };
}

export function generateVapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: encode(ecdh.getPublicKey()), privateKey: encode(ecdh.getPrivateKey()) };
}

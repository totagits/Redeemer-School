import { createHash, randomBytes } from 'node:crypto';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const INVITATION_TTL_HOURS = 48;

export class InvitationDeliveryError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = 'InvitationDeliveryError';
    this.status = status;
  }
}

export function createInvitationSecret() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function invitationConfig(email) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const publicUrl = process.env.APP_PUBLIC_URL?.trim();
  const mode = process.env.EMAIL_MODE?.trim().toLowerCase();
  if (!apiKey || !from || !publicUrl || !['staging', 'production'].includes(mode)) {
    throw new InvitationDeliveryError('Invitation email is not fully configured. Contact the system administrator.');
  }
  if (!EMAIL_RE.test(email)) throw new InvitationDeliveryError('A valid email address is required.', 400);

  let appUrl;
  try {
    appUrl = new URL(publicUrl);
  } catch {
    throw new InvitationDeliveryError('The application email link address is not configured correctly.');
  }
  if (appUrl.protocol !== 'https:' || appUrl.username || appUrl.password || appUrl.search || appUrl.hash) {
    throw new InvitationDeliveryError('The application email link address must be a clean HTTPS URL.');
  }

  if (mode === 'staging') {
    const allowedRecipients = (process.env.EMAIL_ALLOWED_RECIPIENTS || '')
      .split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
    if (!allowedRecipients.includes(email.toLowerCase())) {
      throw new InvitationDeliveryError('Staging invitations can only be sent to approved test inboxes. Add this test email to the staging recipient allowlist in Coolify.', 400);
    }
  }

  return { apiKey, from, appUrl: appUrl.origin };
}

export async function sendAccountInvitation({ email, fullName, role, token }) {
  const { apiKey, from, appUrl } = invitationConfig(email);
  const link = new URL(`/set-password?token=${encodeURIComponent(token)}`, `${appUrl}/`).toString();
  const safeName = escapeHtml(fullName);
  const safeRole = escapeHtml(role.replaceAll('_', ' ').toLowerCase());
  const text = `Hello ${fullName},\n\nAn account for Redeemer's International Academy has been created for you as ${role.replaceAll('_', ' ').toLowerCase()}. Set your password using this one-time link:\n\n${link}\n\nThe link expires in ${INVITATION_TTL_HOURS} hours and can only be used once. If you did not expect this invitation, you can ignore this email.`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><div style="max-width:560px;margin:32px auto;padding:28px;border:1px solid #e2e8f0;border-radius:16px"><p style="color:#1d4ed8;font-size:12px;font-weight:bold;letter-spacing:.12em;text-transform:uppercase">Redeemer ERP · Staging</p><h1 style="font-size:24px">Set up your account</h1><p>Hello ${safeName},</p><p>An account has been created for you as <strong>${safeRole}</strong> at Redeemer's International Academy.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Set my password</a></p><p>This one-time link expires in ${INVITATION_TTL_HOURS} hours. It can only be used once.</p><p style="font-size:13px;color:#64748b">If you were not expecting this message, you can ignore it. Do not forward the link.</p></div></body></html>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: 'Set up your Redeemer ERP account', html, text }),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Do not return Resend's body: it can contain provider details and is not
      // needed by the user to resolve a delivery failure.
      throw new InvitationDeliveryError('The invitation email could not be sent. Check the Resend sender and API key configuration, then try again.');
    }
  } catch (error) {
    if (error instanceof InvitationDeliveryError) throw error;
    throw new InvitationDeliveryError('The invitation email service could not be reached. Please try again.');
  } finally {
    clearTimeout(timeout);
  }
}


export async function sendPasswordResetEmail({ email, fullName, token }) {
  const { apiKey, from, appUrl } = invitationConfig(email);
  const link = new URL('/reset-password?token=' + encodeURIComponent(token), appUrl + '/').toString();
  const safeName = escapeHtml(fullName);
  const text = 'Hello ' + fullName + ',\n\nA password reset was requested for your Redeemer ERP account. Use this one-time link to choose a new password:\n\n' + link + '\n\nThe link expires in 60 minutes and can only be used once. If you did not request this, ignore this email; your current password will remain unchanged.';
  const html = '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><div style="max-width:560px;margin:32px auto;padding:28px;border:1px solid #e2e8f0;border-radius:16px"><p style="color:#1d4ed8;font-size:12px;font-weight:bold;letter-spacing:.12em;text-transform:uppercase">Redeemer ERP</p><h1 style="font-size:24px">Reset your password</h1><p>Hello ' + safeName + ',</p><p>Use the button below to choose a new password for your Redeemer ERP account.</p><p><a href="' + escapeHtml(link) + '" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Reset my password</a></p><p>This one-time link expires in 60 minutes. If you did not request this, ignore this email; your current password will remain unchanged.</p><p style="font-size:13px;color:#64748b">Do not forward the reset link.</p></div></body></html>';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: 'Reset your Redeemer ERP password', html, text }),
      signal: controller.signal,
    });
    if (!response.ok) throw new InvitationDeliveryError('Password reset email delivery failed.');
  } catch (error) {
    if (error instanceof InvitationDeliveryError) throw error;
    throw new InvitationDeliveryError('The password reset email service could not be reached.');
  } finally {
    clearTimeout(timeout);
  }
}

export const invitationTtlHours = INVITATION_TTL_HOURS;

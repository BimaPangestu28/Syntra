import { Resend } from 'resend';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set.');
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'Syntra <noreply@syntra.io>';

export async function sendInvitationEmail(
  email: string,
  inviterName: string,
  orgName: string,
  inviteToken: string
) {
  const resend = getResend();
  const baseUrl = process.env.NEXTAUTH_URL || 'https://app.syntra.io';
  const inviteUrl = `${baseUrl}/accept-invite?token=${inviteToken}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `You've been invited to ${orgName} on Syntra`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #111;">Join ${orgName} on Syntra</h2>
        <p style="color: #555; font-size: 16px; line-height: 24px;">
          <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on Syntra.
        </p>
        <a href="${inviteUrl}" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin: 16px 0;">
          Accept Invitation
        </a>
        <p style="color: #888; font-size: 14px; margin-top: 24px;">
          This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
        </p>
      </div>
    `,
  });
}

export async function sendTeamRoleChangedEmail(
  email: string,
  orgName: string,
  newRole: string
) {
  const resend = getResend();

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Your role in ${orgName} has been updated`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #111;">Role Updated</h2>
        <p style="color: #555; font-size: 16px; line-height: 24px;">
          Your role in <strong>${orgName}</strong> has been updated to <strong>${newRole}</strong>.
        </p>
      </div>
    `,
  });
}

export async function sendTeamRemovedEmail(
  email: string,
  orgName: string
) {
  const resend = getResend();

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `You've been removed from ${orgName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #111;">Removed from Organization</h2>
        <p style="color: #555; font-size: 16px; line-height: 24px;">
          You have been removed from <strong>${orgName}</strong> on Syntra.
          If you believe this was a mistake, please contact your team administrator.
        </p>
      </div>
    `,
  });
}

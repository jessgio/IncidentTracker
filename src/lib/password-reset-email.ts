function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function passwordResetSubject() {
  return 'Reset your Aeris CS Dashboard password'
}

export function buildPasswordResetEmailText(opts: { resetUrl: string }) {
  const { resetUrl } = opts
  return [
    'Reset your Aeris CS Dashboard password',
    '',
    'We received a request to reset your password. Open the link below to choose a new one.',
    'This link expires in one hour.',
    '',
    resetUrl,
    '',
    "If you didn't request this, you can safely ignore this email.",
  ].join('\n')
}

export function buildPasswordResetEmailHtml(opts: { resetUrl: string }) {
  const { resetUrl } = opts
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <tr>
      <td style="padding:24px 24px 8px;">
        <p style="margin:0;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Aeris CS Dashboard</p>
        <h1 style="margin:12px 0 0;font-size:20px;color:#0f172a;">Reset your password</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 24px 16px;">
        <p style="margin:0;font-size:15px;color:#334155;line-height:1.5;">
          We received a request to reset your password. Click the button below to choose a new one.
          This link expires in one hour.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 24px;">
        <p style="margin:0;text-align:center;">
          <a href="${esc(resetUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;">Reset password</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 24px;">
        <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
          If you didn&apos;t request this, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`.trim()
}

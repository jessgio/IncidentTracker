import { commentTextToPlain } from './comment-mentions'

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function commentMentionSubject(orderNumber: string) {
  return `You were mentioned on case #${orderNumber}`
}

export function buildCommentMentionEmailHtml(opts: {
  orderNumber: string
  caseTitle: string
  mentionerName: string
  commentPlain: string
  caseUrl: string
}) {
  const { orderNumber, caseTitle, mentionerName, commentPlain, caseUrl } = opts
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <tr>
      <td style="padding:24px 24px 8px;">
        <p style="margin:0;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Aeris CS Dashboard</p>
        <h1 style="margin:12px 0 0;font-size:20px;color:#0f172a;">You were mentioned in a conversation</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 24px 16px;">
        <p style="margin:0;font-size:15px;color:#334155;line-height:1.5;">
          <strong style="color:#0f172a;">${esc(mentionerName)}</strong> mentioned you on order
          <strong style="color:#0f172a;">#${esc(orderNumber)}</strong>
          (${esc(caseTitle)}).
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 20px;">
        <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;">Message</p>
          <p style="margin:0;font-size:14px;color:#0f172a;white-space:pre-wrap;line-height:1.5;">${esc(commentPlain)}</p>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 28px;">
        <a href="${esc(caseUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;">View conversation</a>
      </td>
    </tr>
  </table>
</body>
</html>`
}

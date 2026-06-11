import crypto from 'node:crypto'

export type LarkWebhookKind = 'chat' | 'alerts'

export type LarkSendResult = { ok: true } | { ok: false; error: string }

export type LarkPostTextNode = { tag: 'text'; text: string }
export type LarkPostLinkNode = { tag: 'a'; text: string; href: string }
export type LarkPostParagraph = Array<LarkPostTextNode | LarkPostLinkNode>

export type LarkPostPayload = {
  zh_cn: {
    title: string
    content: LarkPostParagraph[]
  }
}

function webhookUrl(kind: LarkWebhookKind): string | undefined {
  if (kind === 'alerts') {
    return process.env.LARK_ALERTS_WEBHOOK_URL || process.env.LARK_WEBHOOK_URL
  }
  return process.env.LARK_WEBHOOK_URL
}

export function isLarkConfigured(kind: LarkWebhookKind = 'chat'): boolean {
  return Boolean(webhookUrl(kind))
}

function applySignature(body: Record<string, unknown>) {
  const secret = process.env.LARK_WEBHOOK_SECRET
  if (!secret) return
  const timestamp = String(Math.floor(Date.now() / 1000))
  const stringToSign = `${timestamp}\n${secret}`
  const sign = crypto.createHmac('sha256', stringToSign).update('').digest('base64')
  body.timestamp = timestamp
  body.sign = sign
}

async function sendLarkWebhook(
  message: Record<string, unknown>,
  opts?: { webhookKind?: LarkWebhookKind }
): Promise<LarkSendResult> {
  const url = webhookUrl(opts?.webhookKind ?? 'chat')
  if (!url) {
    return { ok: false, error: 'Lark webhook not configured' }
  }

  const body: Record<string, unknown> = { ...message }
  applySignature(body)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { code?: number; msg?: string }
    if (!res.ok || (data.code !== undefined && data.code !== 0)) {
      return { ok: false, error: data.msg || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lark request failed'
    return { ok: false, error: message }
  }
}

export async function sendLarkText(
  text: string,
  opts?: { webhookKind?: LarkWebhookKind }
): Promise<LarkSendResult> {
  return sendLarkWebhook(
    {
      msg_type: 'text',
      content: { text: text.slice(0, 4000) },
    },
    opts
  )
}

export async function sendLarkPost(
  post: LarkPostPayload,
  opts?: { webhookKind?: LarkWebhookKind }
): Promise<LarkSendResult> {
  return sendLarkWebhook(
    {
      msg_type: 'post',
      content: { post },
    },
    opts
  )
}

export type LarkInteractiveCard = {
  header?: {
    template?: string
    title: { tag: 'plain_text'; content: string }
  }
  elements: Array<{
    tag: 'div'
    text: { tag: 'lark_md'; content: string }
  }>
}

export async function sendLarkInteractive(
  card: LarkInteractiveCard,
  opts?: { webhookKind?: LarkWebhookKind }
): Promise<LarkSendResult> {
  return sendLarkWebhook(
    {
      msg_type: 'interactive',
      card,
    },
    opts
  )
}

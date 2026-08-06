/** Email verification code helpers + Google-like HTML template. */

const CODE_TTL_SECONDS = 60 * 5
const SEND_COOLDOWN_SECONDS = 60

export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function storeEmailCode(
  kv: KVNamespace,
  email: string,
  code: string,
): Promise<void> {
  const key = `email_code:${email.toLowerCase()}`
  await kv.put(key, code, { expirationTtl: CODE_TTL_SECONDS })
  await kv.put(`email_code_sent:${email.toLowerCase()}`, '1', {
    expirationTtl: SEND_COOLDOWN_SECONDS,
  })
}

export async function canSendEmailCode(
  kv: KVNamespace,
  email: string,
): Promise<boolean> {
  const sent = await kv.get(`email_code_sent:${email.toLowerCase()}`)
  return !sent
}

export async function verifyEmailCode(
  kv: KVNamespace,
  email: string,
  code: string,
): Promise<boolean> {
  const key = `email_code:${email.toLowerCase()}`
  const stored = await kv.get(key)
  if (!stored || stored !== code.trim()) return false
  await kv.delete(key)
  return true
}

export type LoginMeta = {
  email: string
  ip: string
  location: string
  timeText: string
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Asia/Shanghai: 8月6日21:53 */
export function formatLoginTime(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || ''

  return `${get('month')}月${get('day')}日${get('hour')}:${get('minute')}`
}

export function formatCfLocation(cf?: IncomingRequestCfProperties | null): string {
  if (!cf) return '未知'
  const city = typeof cf.city === 'string' ? cf.city : ''
  const region = typeof cf.region === 'string' ? cf.region : ''
  const country = typeof cf.country === 'string' ? cf.country : ''
  const bits = [city || region, country].filter(Boolean)
  return bits.length ? bits.join('，') : '未知'
}

export function buildLoginCodeEmail(code: string, meta: LoginMeta): {
  subject: string
  text: string
  html: string
} {
  const email = escapeHtml(meta.email)
  const ip = escapeHtml(meta.ip)
  const location = escapeHtml(meta.location)
  const timeText = escapeHtml(meta.timeText)
  const safeCode = escapeHtml(code)
  const year = new Date().getFullYear()

  const subject = '登录您的 awall 账号'
  const text = [
    '登录您的 awall 账号',
    '',
    `${meta.email} 正在尝试登录 awall。请使用以下验证码完成登录：`,
    '',
    code,
    '',
    '此验证码将在 5 分钟后失效。',
    '',
    `我们向您发送这封邮件，是因为有人于 ${meta.timeText} 尝试登录您的 awall 账号。`,
    `登录 IP：${meta.ip}`,
    `登录位置：${meta.location}`,
    '',
    `© ${year} awall, awall.cc`,
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:Roboto,Helvetica,Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8f9fa;padding:40px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background:#ffffff;border:1px solid #dadce0;border-radius:8px;">
          <tr>
            <td align="center" style="padding:40px 40px 24px;">
              <img src="https://awall.cc/logo.png" width="48" height="48" alt="awall" style="display:block;width:48px;height:48px;border:0;border-radius:10px;" />
              <div style="margin-top:20px;font-size:24px;line-height:1.4;color:#202124;font-weight:400;">
                登录您的 awall 账号
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px;">
              <div style="border-top:1px solid #dadce0;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 8px;font-size:14px;line-height:1.7;color:#3c4043;text-align:left;">
              <strong style="color:#202124;">${email}</strong> 正在尝试登录 awall。如要完成登录，请使用以下验证码：
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 40px 8px;font-size:36px;line-height:1.2;letter-spacing:3px;color:#202124;font-weight:700;">
              ${safeCode}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 28px;font-size:14px;line-height:1.5;color:#5f6368;">
              此验证码将在 5 分钟后失效。
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 36px;font-size:13px;line-height:1.7;color:#5f6368;text-align:left;">
              如果这不是您本人的操作，可以忽略此邮件，您的账号不会有任何变化。
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;margin-top:20px;">
          <tr>
            <td align="center" style="padding:0 12px;font-size:12px;line-height:1.7;color:#5f6368;">
              我们向您发送这封邮件，是因为有人于 ${timeText} 尝试登录您的 awall 账号。<br />
              登录 IP：${ip}<br />
              登录位置：${location}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 12px 0;font-size:12px;line-height:1.6;color:#9aa0a6;">
              © ${year} awall, <a href="https://awall.cc" style="color:#9aa0a6;text-decoration:none;">awall.cc</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}


export async function sendEmailCode(
  env: {
    RESEND_API_KEY?: string
    EMAIL_FROM?: string
    APP_NAME: string
    PUBLIC_ORIGIN?: string
  },
  email: string,
  code: string,
  meta: Omit<LoginMeta, 'email'>,
): Promise<{ delivered: boolean; previewCode?: string; id?: string }> {
  if (!env.RESEND_API_KEY) {
    console.log(`[dev-email] to=${email} code=${code}`, meta)
    return { delivered: false, previewCode: code }
  }

  const content = buildLoginCodeEmail(code, { ...meta, email })
  const from = env.EMAIL_FROM || 'onboarding@resend.dev'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: content.subject,
      text: content.text,
      html: content.html,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`email_send_failed: ${res.status} ${text}`)
  }

  const payload = (await res.json().catch(() => ({}))) as { id?: string }
  console.log(`[resend] to=${email} id=${payload.id || 'unknown'}`)
  return { delivered: true, id: payload.id }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

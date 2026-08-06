interface Env {
  KV: KVNamespace
  R2?: R2Bucket
  APP_NAME: string
  PUBLIC_ORIGIN: string
  JWT_SECRET: string
  EMAIL_FROM?: string
  RESEND_API_KEY?: string
  XUNHUPAY_APPID?: string
  XUNHUPAY_APPSECRET?: string
  XUNHUPAY_GATEWAY?: string
}

export type { Env }

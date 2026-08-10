interface Env {
  KV: KVNamespace
  R2?: R2Bucket
  AI?: Ai
  IMAGES?: ImagesBinding
  APP_NAME: string
  PUBLIC_ORIGIN: string
  JWT_SECRET: string
  EMAIL_FROM?: string
  RESEND_API_KEY?: string
  XUNHUPAY_APPID?: string
  XUNHUPAY_APPSECRET?: string
  XUNHUPAY_GATEWAY?: string
  /** Cloudflare account id (dashboard right sidebar / wrangler whoami). */
  CF_ACCOUNT_ID?: string
  /** API token with Account Analytics Read (secret). */
  CF_API_TOKEN?: string
  /** KV namespace id; defaults to production binding id. */
  CF_KV_NAMESPACE_ID?: string
  /** Worker script name for analytics. */
  CF_WORKER_SCRIPT_NAME?: string
  /** R2 bucket name for analytics. */
  CF_R2_BUCKET_NAME?: string
}

export type { Env }

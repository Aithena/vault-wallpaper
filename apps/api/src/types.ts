import type { Env } from '../worker-configuration'
import type { AdminRecord } from './lib/admins'

export type AppEnv = {
  Bindings: Env
  Variables: {
    userId?: string
    email?: string
    admin?: AdminRecord
  }
}

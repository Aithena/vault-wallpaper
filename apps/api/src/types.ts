import type { Env } from '../worker-configuration'

export type AppEnv = {
  Bindings: Env
  Variables: {
    userId?: string
    email?: string
  }
}

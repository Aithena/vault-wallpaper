import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './types'
import { authRoutes } from './routes/auth'
import { wallpaperRoutes } from './routes/wallpapers'
import { payRoutes } from './routes/pay'
import { meRoutes } from './routes/me'
import { adminRoutes } from './routes/admin'

const app = new Hono<AppEnv>()

app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    credentials: true,
  }),
)

app.get('/', (c) =>
  c.json({
    ok: true,
    service: 'awall-api',
    hint: '这是后端 API。请打开 C 端 https://awall.cc',
    health: '/api/health',
  }),
)

app.get('/api/health', (c) =>
  c.json({ ok: true, app: c.env.APP_NAME, ts: Date.now() }),
)

app.route('/api/auth', authRoutes)
app.route('/api/me', meRoutes)
app.route('/api/wallpapers', wallpaperRoutes)
app.route('/api/pay', payRoutes)
app.route('/api/admin', adminRoutes)

app.notFound((c) => c.json({ error: 'not_found' }, 404))

export default app

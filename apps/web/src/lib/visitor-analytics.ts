import { api } from './api'
import { getOrCreateVisitorId } from './visitor'

/** Site-wide pageview (works without login). Auth header attached when logged in. */
export async function trackVisitorPageview(path: string, label?: string) {
  try {
    await api('/api/analytics/pageview', {
      method: 'POST',
      body: JSON.stringify({
        visitorId: getOrCreateVisitorId(),
        path,
        label,
      }),
    })
  } catch {
    /* ignore */
  }
}

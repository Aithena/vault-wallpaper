import { createApp } from 'vue'
import { ElDialog, ElDrawer } from 'element-plus'
import App from './App.vue'
import { router } from './router'
import { OVERLAY_ROOT } from './lib/overlay'
import './styles/admin.less'
// Imperative EP APIs are not covered by unplugin style injection
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/loading/style/css'

function defaultOverlayRoot(component: { props?: Record<string, { default?: unknown }> }) {
  const appendTo = component.props?.appendTo
  if (appendTo && typeof appendTo === 'object') {
    appendTo.default = OVERLAY_ROOT
  }
}

defaultOverlayRoot(ElDialog)
defaultOverlayRoot(ElDrawer)

createApp(App).use(router).mount('#app')

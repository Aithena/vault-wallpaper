import { createApp } from 'vue'
import { ElDialog, ElDrawer } from 'element-plus'
import App from './App.vue'
import { router } from './router'
import './styles/admin.less'
// Imperative EP APIs are not covered by unplugin style injection
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/loading/style/css'

function defaultAppendToBody(component: { props?: Record<string, unknown> }) {
  const props = component.props
  if (!props) return
  const current = props.appendToBody
  if (current && typeof current === 'object') {
    ;(current as { default: boolean }).default = true
    return
  }
  props.appendToBody = { type: Boolean, default: true }
}

defaultAppendToBody(ElDialog)
defaultAppendToBody(ElDrawer)

createApp(App).use(router).mount('#app')

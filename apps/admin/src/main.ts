import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './styles/admin.less'
// Imperative EP APIs are not covered by unplugin style injection
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/loading/style/css'

createApp(App).use(router).mount('#app')

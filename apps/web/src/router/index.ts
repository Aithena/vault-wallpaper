import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import PricingView from '../views/PricingView.vue'
import PayResultView from '../views/PayResultView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/pricing', name: 'pricing', component: PricingView },
    { path: '/pay/result', name: 'pay-result', component: PayResultView },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

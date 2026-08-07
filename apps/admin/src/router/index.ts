import { createRouter, createWebHistory } from 'vue-router'
import { isAdminLoggedIn } from '../lib/auth'
import AdminLayout from '../layouts/AdminLayout.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: AdminLayout,
      redirect: '/wallpapers',
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('../views/dashboard/DashboardView.vue'),
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('../views/users/UsersView.vue'),
        },
        {
          path: 'users/online',
          name: 'users-online',
          component: () => import('../views/users/OnlineUsersView.vue'),
        },
        {
          path: 'users/blacklist',
          name: 'users-blacklist',
          component: () => import('../views/users/BlacklistView.vue'),
        },
        {
          path: 'wallpapers',
          name: 'wallpapers',
          component: () => import('../views/wallpapers/WallpapersView.vue'),
        },
        {
          path: 'wallpapers/new',
          name: 'wallpapers-new',
          component: () => import('../views/wallpapers/WallpaperFormView.vue'),
        },
        {
          path: 'wallpapers/batch',
          name: 'wallpapers-batch',
          component: () => import('../views/wallpapers/WallpaperBatchUploadView.vue'),
        },
        {
          path: 'wallpapers/:id',
          name: 'wallpapers-edit',
          component: () => import('../views/wallpapers/WallpaperFormView.vue'),
        },
        {
          path: 'categories',
          name: 'categories',
          component: () => import('../views/categories/CategoriesView.vue'),
        },
        {
          path: 'tags',
          name: 'tags',
          component: () => import('../views/tags/TagsView.vue'),
        },
        {
          path: 'downloads',
          name: 'downloads',
          component: () => import('../views/downloads/DownloadsView.vue'),
        },
        {
          path: 'orders',
          name: 'orders',
          component: () => import('../views/orders/OrdersView.vue'),
        },
        {
          path: 'finance',
          name: 'finance',
          component: () => import('../views/finance/FinanceView.vue'),
        },
        {
          path: 'settings/site',
          name: 'settings-site',
          component: () => import('../views/settings/SiteSettingsView.vue'),
        },
        {
          path: 'settings/tiers',
          name: 'settings-tiers',
          component: () => import('../views/settings/TiersView.vue'),
        },
        {
          path: 'settings/announcements',
          name: 'settings-announcements',
          component: () => import('../views/settings/AnnouncementsView.vue'),
        },
        {
          path: 'settings/admins',
          name: 'settings-admins',
          component: () => import('../views/settings/AdminsView.vue'),
        },
        {
          path: 'settings/roles',
          name: 'settings-roles',
          component: () => import('../views/settings/RolesView.vue'),
        },
        {
          path: 'tools/cloudflare',
          name: 'tools-cloudflare',
          component: () => import('../views/tools/CloudflareView.vue'),
        },
        {
          path: 'tools/r2',
          name: 'tools-r2',
          component: () => import('../views/tools/R2View.vue'),
        },
        {
          path: 'tools/resend',
          name: 'tools-resend',
          component: () => import('../views/tools/ResendView.vue'),
        },
        {
          path: 'tools/pay',
          name: 'tools-pay',
          component: () => import('../views/tools/PayView.vue'),
        },
        {
          path: 'tools/audit',
          name: 'tools-audit',
          component: () => import('../views/tools/AuditLogView.vue'),
        },
        {
          path: 'tools/ai-usage',
          name: 'tools-ai-usage',
          component: () => import('../views/ai/AiUsageView.vue'),
        },
        {
          path: 'tools/visitors',
          name: 'tools-visitors',
          component: () => import('../views/tools/VisitorsView.vue'),
        },
        {
          path: 'tools/jobs',
          name: 'tools-jobs',
          component: () => import('../views/tools/JobsView.vue'),
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/wallpapers' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  if (to.meta.public) return true
  if (!isAdminLoggedIn()) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

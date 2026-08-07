import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { adminAuthRoutes } from './admin-auth'
import { adminAdminsRoutes } from './admin-admins'
import { adminRolesRoutes } from './admin-roles'
import { adminSettingsRoutes } from './admin-settings'
import { adminUsersRoutes } from './admin-users'
import { adminBlacklistRoutes } from './admin-blacklist'
import { adminWallpapersRoutes } from './admin-wallpapers'
import { adminOrdersRoutes } from './admin-orders'
import { adminAuditRoutes } from './admin-audit'
import { adminDownloadsRoutes } from './admin-downloads'
import { adminDashboardRoutes } from './admin-dashboard'

export const adminRoutes = new Hono<AppEnv>()

adminRoutes.route('/auth', adminAuthRoutes)
adminRoutes.route('/admins', adminAdminsRoutes)
adminRoutes.route('/roles', adminRolesRoutes)
adminRoutes.route('/settings', adminSettingsRoutes)
adminRoutes.route('/users', adminUsersRoutes)
adminRoutes.route('/blacklist', adminBlacklistRoutes)
adminRoutes.route('/wallpapers', adminWallpapersRoutes)
adminRoutes.route('/orders', adminOrdersRoutes)
adminRoutes.route('/audit', adminAuditRoutes)
adminRoutes.route('/downloads', adminDownloadsRoutes)
adminRoutes.route('/dashboard', adminDashboardRoutes)

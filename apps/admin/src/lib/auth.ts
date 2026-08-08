import type { AdminPublic } from '@vault/shared'
import {
  ApiError,
  adminApi,
  cacheAdminProfile,
  clearAdminToken,
  getAdminToken,
  getCachedAdminProfile,
  setAdminToken,
} from './api'

export type AdminProfile = AdminPublic

export function getAdminProfile(): AdminProfile | null {
  return getCachedAdminProfile()
}

export function isAdminLoggedIn(): boolean {
  return Boolean(getAdminToken())
}

export type LoginResult =
  | { ok: true; profile: AdminProfile }
  | { ok: false; message: string }

const ERROR_MSG: Record<string, string> = {
  invalid_credentials: '用户名或密码错误',
  invalid_payload: '请填写完整信息',
  invalid_email: '邮箱格式不正确',
  invalid_password: '密码至少 6 位',
  invalid_code: '验证码无效或已过期',
  too_frequent: '操作过于频繁，请稍后再试',
  email_send_failed: '邮件发送失败',
  unauthorized: '未登录或登录已失效',
  username_taken: '用户名已存在',
  email_taken: '邮箱已被其他员工绑定',
  invalid_username: '用户名需 3–32 位，小写字母开头',
  last_super_admin: '不能禁用最后一个超级管理员',
  cannot_disable_self: '不能禁用当前登录账号',
  forbidden: '无权限',
  not_found: '员工不存在',
  role_not_found: '角色不存在',
  code_taken: '角色标识已存在',
  invalid_role_code: '角色标识需小写字母开头，2–32 位',
  invalid_name: '请填写名称',
  range_too_long: '查询跨度不能超过 365 天',
  invalid_range: '日期范围无效',
  invalid_date: '日期格式无效',
  system_role: '系统角色不可删除',
  role_in_use: '仍有员工绑定该角色',
  server_misconfigured: '服务未配置 JWT_SECRET',
  request_failed: '请求失败，请稍后重试',
  'Too Many Requests': '请求过于频繁或云端配额已用尽，请稍后再试',
}

export function adminErrorMessage(code: string, status?: number): string {
  if (status === 429) return '请求过于频繁或云端配额已用尽，请稍后再试'
  if (status === 502 || status === 503 || status === 504) {
    return '服务暂时不可用，请稍后再试'
  }
  if (ERROR_MSG[code]) return ERROR_MSG[code]
  if (!code || code === 'Internal Server Error') return '请求失败，请稍后重试'
  return code
}

function failMessage(e: unknown, fallback = 'request_failed'): string {
  if (e instanceof ApiError) return adminErrorMessage(e.code, e.status)
  if (e instanceof Error) return adminErrorMessage(e.message)
  return adminErrorMessage(fallback)
}

export async function loginAdmin(
  username: string,
  password: string,
): Promise<LoginResult> {
  try {
    const data = await adminApi<{ token: string; admin: AdminPublic }>(
      '/api/admin/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      },
    )
    setAdminToken(data.token)
    cacheAdminProfile(data.admin)
    return { ok: true, profile: data.admin }
  } catch (e) {
    return { ok: false, message: failMessage(e, 'invalid_credentials') }
  }
}

export async function refreshAdminMe(): Promise<AdminProfile | null> {
  if (!getAdminToken()) return null
  try {
    const data = await adminApi<{ admin: AdminPublic }>('/api/admin/auth/me')
    cacheAdminProfile(data.admin)
    return data.admin
  } catch {
    clearAdminToken()
    return null
  }
}

export async function requestPasswordReset(email: string): Promise<{
  ok: boolean
  message?: string
  previewCode?: string
}> {
  try {
    const data = await adminApi<{
      ok: boolean
      previewCode?: string
    }>('/api/admin/auth/reset-request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
    return { ok: true, previewCode: data.previewCode }
  } catch (e) {
    return { ok: false, message: failMessage(e) }
  }
}

export async function confirmPasswordReset(input: {
  email: string
  code: string
  newPassword: string
}): Promise<{ ok: boolean; message?: string }> {
  try {
    await adminApi('/api/admin/auth/reset-confirm', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, message: failMessage(e) }
  }
}

export function logoutAdmin() {
  clearAdminToken()
}

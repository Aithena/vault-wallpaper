import { computed } from 'vue'
import { getAdminProfile } from './auth'

export function usePermission() {
  const profile = computed(() => getAdminProfile())

  function hasMenu(key: string): boolean {
    const menus = profile.value?.menus
    if (!menus) return true
    return menus.includes(key)
  }

  function hasButton(key: string): boolean {
    const buttons = profile.value?.buttons
    if (!buttons) return true
    return buttons.includes(key)
  }

  return { profile, hasMenu, hasButton }
}

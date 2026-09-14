export const DROPDOWN_MENU_CLASS = 'app-dropdown-menu'
export const DROPDOWN_MENU_ITEM_CLASS = 'app-dropdown-menu-item'
export const DROPDOWN_MENU_DIVIDER_CLASS = 'app-dropdown-menu-divider'
export const DROPDOWN_MENU_CHECK_ITEM_CLASS = 'app-dropdown-menu-check-item'
export const DROPDOWN_MENU_LIST_CLASS = 'app-dropdown-menu-list'

export function dropdownMenuItemClassName({ selected = false, rich = false } = {}) {
  const classes = [DROPDOWN_MENU_ITEM_CLASS]
  if (rich) classes.push('is-rich')
  if (selected) classes.push('is-selected')
  return classes.join(' ')
}

export function dropdownMenuCheckItemClassName({ selected = false } = {}) {
  return selected
    ? `${DROPDOWN_MENU_ITEM_CLASS} ${DROPDOWN_MENU_CHECK_ITEM_CLASS} is-selected`
    : `${DROPDOWN_MENU_ITEM_CLASS} ${DROPDOWN_MENU_CHECK_ITEM_CLASS}`
}

import React, { useRef, useState } from 'react'
import { dropdownMenuItemClassName } from './dropdown-menu-styles.js'
import { DropdownMenuPortal, useDropdownDismiss } from './DropdownMenuPortal.jsx'
import StyleKindIcon from './StyleKindIcon.jsx'

export default function AppDropdownSelect({
  value,
  options = [],
  onChange,
  disabled = false,
  ariaLabel,
  prefix,
  minMenuWidth = 160,
  matchAnchorWidth = false,
  placement = 'bottom',
  className = '',
  menuClassName,
  showOptionIcons = false,
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const selected = options.find((item) => item.value === value) || options[0]
  const closeMenu = () => setOpen(false)

  useDropdownDismiss(open, closeMenu, triggerRef, menuRef)

  const toggleOpen = () => {
    if (disabled || options.length === 0) return
    setOpen((current) => !current)
  }

  return (
    <div className={`app-dropdown-select ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="app-dropdown-select__trigger"
        disabled={disabled || options.length === 0}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {prefix ? <span className="app-dropdown-select__prefix">{prefix}</span> : null}
        <span className="app-dropdown-select__label">{selected?.label || '请选择'}</span>
        <span className="app-dropdown-select__caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      <DropdownMenuPortal
        ref={menuRef}
        open={open}
        anchorRef={triggerRef}
        minWidth={minMenuWidth}
        matchAnchorWidth={matchAnchorWidth}
        placement={placement}
        className={menuClassName}
      >
        <div role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                onChange?.(option.value)
                closeMenu()
              }}
              className={dropdownMenuItemClassName({ selected: value === option.value, rich: Boolean(option.description) })}
            >
              {option.description ? (
                <span className="app-dropdown-menu-item__content">
                  {showOptionIcons && option.kind ? (
                    <span className="app-dropdown-menu-item__icon" aria-hidden="true">
                      <StyleKindIcon kind={option.kind} size={14} />
                    </span>
                  ) : null}
                  <span className="app-dropdown-menu-item__label">{option.label}</span>
                  <span className="app-dropdown-menu-item__desc">{option.description}</span>
                </span>
              ) : (
                option.label
              )}
            </button>
          ))}
        </div>
      </DropdownMenuPortal>
    </div>
  )
}

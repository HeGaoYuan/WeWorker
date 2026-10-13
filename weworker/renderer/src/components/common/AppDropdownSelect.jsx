import React, { useId, useRef, useState } from 'react'
import { CheckOutlined, DownOutlined } from '@ant-design/icons'
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
  renderOptionSuffix,
  menuHeader,
  required = false,
}) {
  const listId = useId()
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
        aria-controls={open ? listId : undefined}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault()
            setOpen(true)
            requestAnimationFrame(() => {
              const menu = menuRef.current
              const option = menu?.querySelector('[role="option"][aria-selected="true"]:not(:disabled)')
                || menu?.querySelector('[role="option"]:not(:disabled)')
              option?.focus()
            })
          }
        }}
      >
        {prefix ? <span className="app-dropdown-select__prefix">{prefix}</span> : null}
        <span className="app-dropdown-select__label">{selected?.label || '请选择'}</span>
        {renderOptionSuffix?.(selected)}
        <DownOutlined className="app-dropdown-select__caret" aria-hidden="true" />
      </button>
      {required && <input className="app-dropdown-select__validation" tabIndex={-1} aria-hidden="true" required disabled={disabled} value={value ?? ''} onChange={() => {}} onInvalid={(event) => { event.preventDefault(); triggerRef.current?.focus() }} />}

      <DropdownMenuPortal
        ref={menuRef}
        open={open}
        anchorRef={triggerRef}
        minWidth={minMenuWidth}
        matchAnchorWidth={matchAnchorWidth}
        placement={placement}
        className={menuClassName}
      >
        {menuHeader}
        <div id={listId} role="listbox" aria-label={ariaLabel} onKeyDown={(event) => {
          const items = [...event.currentTarget.querySelectorAll('[role="option"]:not(:disabled)')]
          const index = items.indexOf(document.activeElement)
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
            items[next]?.focus()
          }
          if (event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault()
            event.stopPropagation()
            closeMenu()
            triggerRef.current?.focus()
          }
        }}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              disabled={disabled || option.disabled}
              onClick={() => {
                onChange?.(option.value)
                closeMenu()
                triggerRef.current?.focus()
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
                <span className="app-dropdown-menu-item__label">{option.label}</span>
              )}
              {renderOptionSuffix?.(option)}
              <DropdownMenuCheck selected={value === option.value} />
            </button>
          ))}
        </div>
      </DropdownMenuPortal>
    </div>
  )
}

export function DropdownMenuCheck({ selected }) {
  return <CheckOutlined className="app-dropdown-menu-check-icon" style={{ visibility: selected ? 'visible' : 'hidden' }} aria-hidden="true" />
}

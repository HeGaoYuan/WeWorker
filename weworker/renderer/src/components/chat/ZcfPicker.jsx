import React, { useMemo } from 'react'
import AppDropdownSelect from '../common/AppDropdownSelect.jsx'
import { resolveStyleKind } from '../common/StyleKindIcon.jsx'

export default function ZcfPicker({
  kind = 'role',
  value,
  options = [],
  onChange,
  disabled = false,
}) {
  const prefix = kind === 'role' ? '风格' : '模式'
  const ariaLabel = kind === 'role' ? '选择 AI 风格' : '选择工作流模式'

  const selectOptions = useMemo(
    () => options.map((item) => ({
      value: item.id,
      label: item.label,
      description: item.description,
      ...(kind === 'role' ? { kind: resolveStyleKind(item.id) } : {}),
    })),
    [options, kind],
  )

  return (
    <AppDropdownSelect
      value={value}
      options={selectOptions}
      onChange={onChange}
      disabled={disabled}
      ariaLabel={ariaLabel}
      prefix={prefix}
      minMenuWidth={kind === 'mode' ? 520 : 420}
      placement="top"
      className="zcf-picker"
      menuClassName="app-dropdown-menu zcf-picker-menu"
      showOptionIcons={kind === 'role'}
    />
  )
}

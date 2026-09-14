import React, { useState } from 'react'
import { getSkillSummary, stringifyToolValue } from '../../utils/tool-display.js'
import ToolRunningIndicator from './ToolRunningIndicator.jsx'
import ToolTimingBadge from './ToolTimingBadge.jsx'
import { ToolRowChevron, ToolSkillIcon } from './ToolRowIcons.jsx'

function NumberedCodeBlock({ text, scrollable = false }) {
  const lines = String(text ?? '').split('\n')
  const width = String(lines.length).length

  return (
    <div className={`tool-skill-code${scrollable ? ' tool-skill-code--scroll' : ''}`}>
      {lines.map((line, index) => (
        <div key={index} className="tool-skill-code__line">
          <span
            className="tool-skill-code__lineno"
            style={{ width: `${Math.max(width, 1) + 1}ch` }}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <span className="tool-skill-code__content">{line || ' '}</span>
        </div>
      ))}
    </div>
  )
}

export default function SkillToolCallBlock({ block, streaming = false }) {
  const [open, setOpen] = useState(false)
  const running = streaming && block.status === 'running'
  const summary = getSkillSummary(block.args)
  const argsText = block.args && Object.keys(block.args).length > 0
    ? JSON.stringify(block.args, null, 2)
    : ''
  const resultText = block.result && !block.image ? stringifyToolValue(block.result) : ''

  return (
    <div className="tool-skill-panel">
      <button
        type="button"
        className="tool-row-header tool-skill-panel__header"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="tool-row-header__icon" aria-hidden="true">{running ? <ToolRunningIndicator /> : <ToolSkillIcon />}</span>
        <span className="tool-row-header__body">
          <span className="tool-skill-panel__title">Skill</span>
          {summary && (
            <span className="tool-skill-panel__summary" title={summary}>{summary}</span>
          )}
          <ToolTimingBadge thinkMs={block.thinkMs} execMs={block.execMs} />
          <span className="tool-row-header__chevron tool-skill-panel__chevron" aria-hidden="true">
            <ToolRowChevron expanded={open} />
          </span>
        </span>
      </button>

      {open && (
        <div className="tool-skill-panel__body">
          {argsText && (
            <div className="tool-skill-panel__section">
              <div className="tool-skill-panel__section-label">参数</div>
              <NumberedCodeBlock text={argsText} />
            </div>
          )}

          {block.result && !block.image && (
            <div className="tool-skill-panel__section">
              <div className="tool-skill-panel__section-label">结果</div>
              <NumberedCodeBlock text={resultText} scrollable />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

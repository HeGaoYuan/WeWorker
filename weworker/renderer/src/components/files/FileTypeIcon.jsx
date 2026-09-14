import React from 'react'

const FILE_TYPE_GROUPS = [
  { exts: ['json', 'jsonl', 'lock'], kind: 'json', color: '#d97706' },
  { exts: ['md', 'markdown', 'rst'], kind: 'markdown', color: '#16a34a' },
  { exts: ['txt', 'text', 'log'], kind: 'document', color: '#9ca3af' },
  { exts: ['java', 'kt', 'kts', 'scala'], kind: 'code', label: 'J', color: '#d97706' },
  { exts: ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'], kind: 'code', label: 'JS', color: '#b59b00' },
  { exts: ['py', 'pyw', 'rb', 'php', 'go', 'rs', 'swift', 'lua', 'pl'], kind: 'code', label: '</>', color: '#339CFF' },
  { exts: ['c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'cs'], kind: 'code', label: 'C', color: '#7c3aed' },
  { exts: ['html', 'htm', 'css', 'scss', 'sass', 'less'], kind: 'code', label: '<>', color: '#dc2626' },
  { exts: ['xml', 'toml', 'yaml', 'yml', 'ini', 'conf', 'cfg', 'env', 'properties'], kind: 'settings', color: '#0f766e' },
  { exts: ['sql', 'db', 'sqlite', 'sqlite3', 'mdb'], kind: 'database', color: '#0891b2' },
  { exts: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst'], kind: 'archive', color: '#8b5cf6' },
  { exts: ['exe', 'msi', 'bat', 'cmd', 'ps1', 'sh', 'app', 'dmg', 'deb', 'rpm'], kind: 'executable', color: '#ef4444' },
  { exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'svg', 'heic'], kind: 'image', color: '#16a34a' },
  { exts: ['pdf'], kind: 'pdf', color: '#dc2626' },
  { exts: ['doc', 'docx', 'rtf', 'odt'], kind: 'document', color: '#339CFF' },
  { exts: ['xls', 'xlsx', 'csv', 'tsv', 'ods'], kind: 'sheet', color: '#16a34a' },
  { exts: ['ppt', 'pptx', 'odp'], kind: 'slides', color: '#ea580c' },
  { exts: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'], kind: 'audio', color: '#db2777' },
  { exts: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'], kind: 'video', color: '#7c3aed' },
  { exts: ['ttf', 'otf', 'woff', 'woff2', 'eot'], kind: 'font', color: '#64748b' },
  { exts: ['pem', 'crt', 'cer', 'key', 'p12', 'pfx'], kind: 'key', color: '#ca8a04' },
]

const FILE_TYPE_META = FILE_TYPE_GROUPS.reduce((acc, group) => {
  for (const ext of group.exts) acc[ext] = group
  return acc
}, {})

export function getFileExtension(name) {
  const base = String(name || '').split(/[\\/]/).pop() || ''
  if (!base.includes('.') || (base.startsWith('.') && base.indexOf('.', 1) < 0)) return ''
  return base.split('.').pop().toLowerCase()
}

export function getFileTypeMeta(name) {
  const lower = String(name || '').toLowerCase()
  if (lower === 'dockerfile') return { kind: 'code', label: 'DK', color: '#0ea5e9' }
  if (lower === 'makefile') return { kind: 'code', label: 'MK', color: '#64748b' }
  if (lower.startsWith('.env')) return FILE_TYPE_META.env
  const ext = getFileExtension(name)
  return FILE_TYPE_META[ext] || { kind: 'document', color: 'var(--text-muted)' }
}

export function getFileTypeLabel(name) {
  const ext = getFileExtension(name)
  if (ext) return ext.toUpperCase()
  const meta = getFileTypeMeta(name)
  return meta.kind === 'document' ? 'FILE' : meta.kind.toUpperCase()
}

function JsonGlyph({ color }) {
  return <span style={{ color, fontSize: 15, fontWeight: 700, lineHeight: 1, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>{'{}'}</span>
}

function MarkdownGlyph({ color }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: 'block' }}>
      <path d="M4.5 7v10" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M4.5 7l4 5 4-5v10" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 7v7" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14.2 12.2l2.3 2.3 2.3-2.3" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CodeGlyph({ color, label }) {
  return <span style={{ color, fontSize: label?.length > 2 ? 11 : 12, fontWeight: 800, lineHeight: 1, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>{label || '</>'}</span>
}

function FileGlyphIcon({ meta }) {
  const color = meta.color
  if (meta.kind === 'json') return <JsonGlyph color={color} />
  if (meta.kind === 'markdown') return <MarkdownGlyph color={color} />
  if (meta.kind === 'code') return <CodeGlyph color={color} label={meta.label} />
  if (meta.kind === 'archive') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16v12H4z" />
      <path d="M7 4h10l3 3H4z" />
      <path d="M10 10h4" />
      <path d="M10 13h4" />
      <path d="M10 16h4" />
    </svg>
  )
  if (meta.kind === 'executable') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 5l10 7-10 7z" />
      <path d="M5 5v14" />
    </svg>
  )
  if (meta.kind === 'image') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M6 17l4.5-4 3 3 2-2 2.5 3" />
    </svg>
  )
  if (meta.kind === 'settings') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
      <circle cx="9" cy="7" r="2" fill="var(--bg-secondary)" />
      <circle cx="15" cy="12" r="2" fill="var(--bg-secondary)" />
      <circle cx="11" cy="17" r="2" fill="var(--bg-secondary)" />
    </svg>
  )
  if (meta.kind === 'database') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </svg>
  )
  if (meta.kind === 'pdf') return <span style={{ color, fontSize: 11, fontWeight: 900, lineHeight: 1 }}>PDF</span>
  if (meta.kind === 'sheet') return <span style={{ color, fontSize: 11, fontWeight: 900, lineHeight: 1 }}>X</span>
  if (meta.kind === 'slides') return <span style={{ color, fontSize: 11, fontWeight: 900, lineHeight: 1 }}>P</span>
  if (meta.kind === 'audio') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V6l9-2v12" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="16" cy="16" r="2" />
    </svg>
  )
  if (meta.kind === 'video') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="6" width="14" height="12" rx="2" />
      <path d="M18 10l3-2v8l-3-2" />
    </svg>
  )
  if (meta.kind === 'font') return <span style={{ color, fontSize: 13, fontWeight: 900, lineHeight: 1 }}>F</span>
  if (meta.kind === 'key') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="14" r="3" />
      <path d="M11 14h8" />
      <path d="M16 14v-2" />
      <path d="M19 14v-2" />
    </svg>
  )
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h7l4 4v14H7z" fill="color-mix(in srgb, currentColor 10%, transparent)" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  )
}

export default function FileGlyph({ name, size = 17 }) {
  const meta = getFileTypeMeta(name)
  return (
    <span style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <FileGlyphIcon meta={meta} />
    </span>
  )
}

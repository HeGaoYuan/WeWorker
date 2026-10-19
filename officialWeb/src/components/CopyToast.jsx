/** 复制成功时的全局轻提示（固定于视口底部） */
export default function CopyToast({ visible, message = '复制成功' }) {
  return (
    <div
      className={`copy-toast ${visible ? 'copy-toast-visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{message}</span>
    </div>
  )
}

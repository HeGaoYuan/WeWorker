import { Link } from 'react-router-dom'
import { useState } from 'react'

const FEEDBACK_GROUP_IMAGE = '/images/feedback-group.png'

export default function Footer() {
  const [showFeedback, setShowFeedback] = useState(false)

  return (
    <footer className="border-t border-border mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="WeWorker" className="w-6 h-6 rounded" />
          <span className="text-sm text-muted">WeWorker</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted">
          <Link to="/download" className="hover:text-[rgb(var(--color-text))] transition-colors">
            下载
          </Link>
          <button
            type="button"
            className="hover:text-[rgb(var(--color-text))] transition-colors"
            onClick={() => setShowFeedback(true)}
          >
            反馈问题
          </button>
        </div>
      </div>

      {showFeedback && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
          onClick={() => setShowFeedback(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="关闭反馈弹窗"
              className="absolute right-3 top-3 text-muted hover:text-[rgb(var(--color-text))] transition-colors"
              onClick={() => setShowFeedback(false)}
            >
              ×
            </button>
            <h3 className="text-[rgb(var(--color-text))] text-sm font-medium mb-3 pr-6">扫码加入反馈群</h3>
            <img
              src={FEEDBACK_GROUP_IMAGE}
              alt="反馈群二维码"
              className="w-full rounded-lg border border-border bg-bg/50"
            />
            <p className="text-xs text-muted mt-3">
              若图片过期联系gaoyuanhe(贺高远)更新
            </p>
          </div>
        </div>
      )}
    </footer>
  )
}

import { useEffect, useRef, useState } from 'react'

const MSG_TEXT = `step1: 帮我在163邮箱下载在这个月收到的联通发票pdf
step2: 如果这个发票pdf是加密状态，请你解密
step3: 帮我把step1的发票pdf上传到范妮斯，并一键匹配这些发票
step4: 如果step2匹配后发票符合要求请帮我提交，如果不符合要求请告诉我还差哪些发票`

const STEPS = [
  { id: 'wecom-typing',   duration: 9000, phase: 'wecom-input' },
  { id: 'wecom-sent',     duration: 250, phase: 'wecom-sent' },
  { id: 'ww-receive',     duration: 300, phase: 'ww-receive' },
  { id: 'ww-thinking',    duration: 450, phase: 'ww-thinking' },
  { id: 'open-browser',   duration: 1500, phase: 'tool-call', tool: 'open_browser' },
  { id: 'mail163-nav',    duration: 1200, phase: 'browser-mail163' },
  { id: 'mail163-inbox',  duration: 2200, phase: 'mail163-inbox' },
  { id: 'mail163-dl',     duration: 3200, phase: 'mail163-download' },
  { id: 'fannisi-nav',    duration: 1200, phase: 'browser-opening' },
  { id: 'upload-sheet',   duration: 2800, phase: 'upload-invoice-sheet' },
  { id: 'classify-modal', duration: 2200, phase: 'classify-modal' },
  { id: 'search-call',    duration: 1500, phase: 'tool-call', tool: 'fannisi.expense.list_invoices' },
  { id: 'browser-search', duration: 1500, phase: 'browser-searching' },
  { id: 'order-1',        duration: 1500, phase: 'tool-call', tool: 'fannisi.expense.upload_invoices' },
  { id: 'order-detail',   duration: 1800, phase: 'opening-order' },
  { id: 'ww-response',    duration: 2500, phase: 'ww-response' },
  { id: 'wecom-notify',   duration: 2500, phase: 'wecom-notify' },
  { id: 'done',           duration: 1500, phase: 'complete' },
]

const AI_THOUGHTS = [
  '收到企业微信消息...',
  '登录 163 邮箱，定位本月联通发票 PDF…',
  '解密（若加密）→ 打开范妮斯上传并一键匹配 → 校验是否可提交…',
]

/** 与范妮思 index.vue + InvoiceCard.vue 列表展示一致（示意数据） */
const KABAO_INVOICES = [
  {
    amount: '153.00',
    type: 'meal',
    label: '餐饮',
    invoiceNumber: '26362000000523858516',
    invoiceDate: '2026-03-29',
    seller: '珠山区大江二期景水瑶餐饮店',
  },
  {
    amount: '44.00',
    type: 'communication',
    label: '通讯',
    invoiceNumber: '26427000000323924741',
    invoiceDate: '2026-03-15',
    seller: '中国电信股份有限公司武汉分公司',
  },
]

/** 发票归类弹窗示意（与真实交互一致） */
const CLASSIFY_ROWS = [
  { title: '通讯发票', period: '2026-04', no: '26427000000323924741' },
  { title: '餐饮发票', period: '2026-03', no: '26362000000523858516' },
]

/** 163 收件箱示意（多封联通电子发票，下载动画按 invoiceIdx 顺序） */
const MAIL163_ROWS = [
  { from: '中国联通', subject: '【电子发票】您的话费电子发票已开具', snippet: '附件：增值税电子普通发票.pdf · 本月', date: '今天', file: '联通电子发票_202604_01.pdf', invoiceIdx: 0 },
  { from: '中国联通', subject: '【电子发票】增值电信服务费发票', snippet: '附件：电子发票.pdf · 本月', date: '今天', file: '联通电子发票_202604_02.pdf', invoiceIdx: 1 },
  { from: '中国联通', subject: '【电子发票】您的话费发票（补开）', snippet: '附件：发票.pdf', date: '昨天', file: '联通电子发票_202603_03.pdf', invoiceIdx: 2 },
  { from: '网易邮箱团队', subject: '安全登录提醒', snippet: '您在新设备登录邮箱', date: '昨天' },
]

function typePillClass(type) {
  if (type === 'meal') return 'text-[#ffa229] bg-[rgba(255,162,41,0.08)]'
  if (type === 'communication') return 'text-[#0abf83] bg-[rgba(10,191,131,0.08)]'
  return 'text-[#3070f0] bg-[rgba(48,112,240,0.08)]'
}

function useTypewriter(text, active, speed = 55) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!active) { setDisplayed(''); setDone(false); return }
    let i = 0; setDisplayed(''); setDone(false)
    ref.current = setInterval(() => {
      i++; setDisplayed(text.slice(0, i))
      if (i >= text.length) { clearInterval(ref.current); setDone(true) }
    }, speed)
    return () => clearInterval(ref.current)
  }, [active, text, speed])
  return { displayed, done }
}

export default function WeWorkerAnimation() {
  const [stepIdx, setStepIdx] = useState(0)
  const [running, setRunning] = useState(true)
  const [aiThoughts, setAiThoughts] = useState([])
  const [wwMessages, setWwMessages] = useState([])   // messages in WeWorker chat
  const [showOrders, setShowOrders] = useState(false)
  const [openedOrder, setOpenedOrder] = useState(-1)
  const [currentTool, setCurrentTool] = useState(null)
  const [browserUrl, setBrowserUrl] = useState('about:blank')
  const [wecomNotify, setWecomNotify] = useState(false)
  const [mail163DlStep, setMail163DlStep] = useState(0)
  const timerRef = useRef(null)
  const mail163DlTimersRef = useRef([])
  /** 企业微信打字完成后只触发一次：立刻同步 WeWorker 并跳过中间等待步骤 */
  const wecomHandoffRef = useRef(false)

  const step = STEPS[stepIdx]
  const typingActive = running && step?.phase === 'wecom-input'
  const { displayed: typedText, done: typingDone } = useTypewriter(MSG_TEXT, typingActive, 22)

  useEffect(() => { setRunning(true) }, [])

  useEffect(() => {
    if (stepIdx === 0) wecomHandoffRef.current = false
  }, [stepIdx])

  useEffect(() => {
    if (!running || !step) return

    if (step.phase === 'wecom-sent') {
      // message appears as sent in WeCom
    }
    if (step.phase === 'ww-receive') {
      setWwMessages([{ role: 'user', text: MSG_TEXT, source: '企业微信' }])
    }
    if (step.phase === 'ww-thinking') {
      AI_THOUGHTS.forEach((t, i) => setTimeout(() => setAiThoughts(p => [...p, t]), i * 130))
    }
    if (step.phase === 'tool-call') setCurrentTool(step.tool)
    if (step.phase === 'browser-mail163') setBrowserUrl('mail.163.com')
    if (step.phase === 'browser-opening') setBrowserUrl('invoice.fannisi.com')
    if (step.id === 'search-call') setShowOrders(true)
    if (step.phase === 'opening-order') setOpenedOrder(0)
    if (step.phase === 'ww-response') {
      setWwMessages(p => [...p, {
        role: 'assistant',
        text: '✓ 163 邮箱本月联通发票 PDF 已下载并完成解密\n已上传至范妮斯、一键匹配完成；2 张符合要求，已代为提交，待财务审核',
      }])
    }
    if (step.phase === 'wecom-notify') setWecomNotify(true)

    timerRef.current = setTimeout(() => {
      const next = stepIdx + 1
      if (next >= STEPS.length) {
        setTimeout(() => {
          setStepIdx(0); setAiThoughts([]); setWwMessages([])
          setShowOrders(false); setOpenedOrder(-1); setCurrentTool(null)
          setBrowserUrl('about:blank'); setWecomNotify(false)
          setMail163DlStep(0)
        }, 800)
      } else { setStepIdx(next) }
    }, step.duration)

    return () => clearTimeout(timerRef.current)
  }, [stepIdx, running])

  useEffect(() => {
    if (!running || !typingDone || stepIdx !== 0 || STEPS[0]?.phase !== 'wecom-input') return
    if (wecomHandoffRef.current) return
    wecomHandoffRef.current = true
    clearTimeout(timerRef.current)
    setWwMessages([{ role: 'user', text: MSG_TEXT, source: '企业微信' }])
    setStepIdx(3)
  }, [typingDone, running, stepIdx])

  const phase = step?.phase || 'idle'

  useEffect(() => {
    mail163DlTimersRef.current.forEach(clearTimeout)
    mail163DlTimersRef.current = []
    if (phase !== 'mail163-download') {
      setMail163DlStep(0)
      return
    }
    setMail163DlStep(0)
    const delays = [380, 1050, 1780, 2510]
    delays.forEach((ms, i) => {
      const id = setTimeout(() => setMail163DlStep(i + 1), ms)
      mail163DlTimersRef.current.push(id)
    })
    return () => {
      mail163DlTimersRef.current.forEach(clearTimeout)
      mail163DlTimersRef.current = []
    }
  }, [phase])

  const mail163Active = ['browser-mail163', 'mail163-inbox', 'mail163-download'].includes(phase)
  const dataFlowActive = phase === 'tool-call' || mail163Active || phase === 'browser-opening'
    || phase === 'upload-invoice-sheet' || phase === 'classify-modal'
  const wecomSent = ['wecom-sent', 'ww-receive', 'ww-thinking', 'tool-call',
    'browser-mail163', 'mail163-inbox', 'mail163-download', 'browser-opening', 'upload-invoice-sheet', 'classify-modal', 'browser-searching', 'opening-order', 'ww-response', 'wecom-notify', 'complete'].includes(phase)

  return (
    <div className="w-full select-none py-8 overflow-x-auto">
      <div className="min-w-[1100px] max-w-7xl mx-auto">

        {/* Zone labels */}
        <div className="flex gap-0 mb-3 items-end">
          <div className="w-56 flex-shrink-0 text-center">
            <span className="text-xs text-muted px-2 py-0.5 rounded-full border border-border">📱 随时随地</span>
          </div>
          <div className="w-px" />
          <div className="flex-1 text-center">
            <span className="text-xs text-muted px-2 py-0.5 rounded-full border border-border">💻 你的电脑</span>
          </div>
        </div>

        <div className="flex gap-0">
          {/* ── 企业微信 ── */}
          <div className="w-56 flex-shrink-0">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden flex flex-col" style={{ height: 460 }}>
              {/* Title bar */}
              <div className="bg-gray-800/80 px-3 py-2.5 flex items-center gap-2 border-b border-gray-700">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                </div>
                <div className="flex items-center gap-1.5 flex-1 justify-center">
                  <div className="w-4 h-4 rounded bg-[#1989FA] flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                      <path d="M9.5 3C6.46 3 4 5.46 4 8.5c0 1.74.84 3.29 2.14 4.28L5.5 15l2.5-1.25c.47.13.97.25 1.5.25 3.04 0 5.5-2.46 5.5-5.5S12.54 3 9.5 3z"/>
                    </svg>
                  </div>
                  <span className="text-xs text-gray-300">企业微信</span>
                </div>
              </div>
              {/* Chat header */}
              <div className="px-3 py-2 border-b border-gray-700/50 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-accent/30 flex items-center justify-center text-xs text-accent font-bold">W</div>
                <span className="text-xs text-gray-300">WeWorker 助手</span>
              </div>
              {/* Messages */}
              <div className="flex-1 p-3 space-y-2 overflow-y-auto bg-[#f5f5f5]">
                {/* User message */}
                {(typingActive || wecomSent) && (
                  <div className="flex justify-end">
                    <div className="bg-[#BAD9FE] rounded-xl rounded-tr-sm px-2.5 py-1.5 max-w-[95%]">
                      <div className="text-[11px] text-gray-900 leading-snug whitespace-pre-line">
                        {typingDone || !typingActive ? MSG_TEXT : typedText}
                        {!typingDone && typingActive && <span className="inline-block w-0.5 h-3 bg-gray-700/70 ml-0.5 animate-pulse align-middle" />}
                      </div>
                    </div>
                  </div>
                )}
                {/* Bot reply */}
                {wecomNotify && (
                  <div className="flex gap-1.5">
                    <div className="w-6 h-6 rounded-lg bg-accent/30 flex items-center justify-center text-xs text-accent font-bold flex-shrink-0 mt-0.5">W</div>
                    <div className="bg-white rounded-xl rounded-tl-sm px-2.5 py-1.5 shadow-sm max-w-[85%]">
                      <div className="text-xs text-gray-700 leading-relaxed">
                        ✅ 任务完成<br/>
                        <span className="text-gray-500">联通发票已解密并上传范妮斯，匹配通过 2 张，已提交，合计 ¥197.00</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Input */}
              <div className="px-3 py-2 bg-white border-t border-gray-200 flex items-center gap-2">
                <div className="flex-1 bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-400">发消息...</div>
              </div>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="flex flex-col items-center justify-center px-3 gap-2">
            <div className="w-px flex-1 bg-gradient-to-b from-transparent via-border to-transparent" />
            <div className={`w-2 h-2 rounded-full transition-all duration-200 ${wecomSent && !wecomNotify ? 'bg-accent animate-pulse' : 'bg-gray-700'}`} />
            <div className="w-px flex-1 bg-gradient-to-b from-transparent via-border to-transparent" />
          </div>

          {/* ── WeWorker + Browser ── */}
          <div className="flex-1 flex gap-4">
            {/* WeWorker */}
            <div className="flex-1 min-w-0">
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden flex flex-col" style={{ height: 460 }}>
                <div className="bg-gray-800/80 px-4 py-2.5 flex items-center gap-2 border-b border-gray-700">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 justify-center">
                    <div className="w-4 h-4 rounded bg-accent flex items-center justify-center text-white font-bold text-[9px]">W</div>
                    <span className="text-xs text-gray-300">WeWorker</span>
                  </div>
                </div>
                <div className="flex flex-1 overflow-hidden">
                  {/* Sidebar */}
                  <div className="w-32 border-r border-gray-700/50 bg-gray-900/50 p-2 flex flex-col gap-1">
                    <div className="text-[10px] text-gray-500 font-semibold px-1.5 py-0.5">对话</div>
                    {wwMessages.length > 0 && (
                      <div className="px-1.5 py-1 rounded text-[10px] bg-accent/20 text-accent line-clamp-2 break-all">
                        {(MSG_TEXT.split('\n')[0] || '').slice(0, 18)}…
                      </div>
                    )}
                    <div className="text-[10px] text-gray-500 font-semibold px-1.5 py-0.5 mt-1">定时任务</div>
                    <div className="px-1.5 py-1 rounded text-[10px] text-gray-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />每日报告
                    </div>
                  </div>
                  {/* Chat */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                      {wwMessages.map((m, i) => (
                        <div key={i} className={`flex gap-1.5 ${m.role === 'user' ? 'justify-end' : ''}`}>
                          {m.role === 'assistant' && (
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-accent to-purple-500 flex-shrink-0 mt-0.5" />
                          )}
                          <div className={`max-w-[85%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-accent/20 border border-accent/30 text-white rounded-tr-sm'
                              : 'bg-gray-800/50 border border-gray-700 text-gray-200 rounded-tl-sm'
                          }`}>
                            {m.source && <div className="text-[9px] text-accent mb-0.5">来自 {m.source}</div>}
                            <span className="whitespace-pre-line">{m.text}</span>
                          </div>
                        </div>
                      ))}
                      {aiThoughts.length > 0 && (
                        <div className="flex gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-gray-700 flex-shrink-0 mt-0.5" />
                          <div className="bg-gray-800/50 border border-gray-700 rounded-xl rounded-tl-sm px-2.5 py-1.5">
                            <div className="text-[9px] text-gray-400 mb-1 font-mono">思考中...</div>
                            {aiThoughts.map((t, i) => (
                              <div key={i} className="text-[10px] text-gray-300 font-mono flex gap-1">
                                <span className="text-accent">→</span><span>{t}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {currentTool && phase === 'tool-call' && (
                        <div className="flex gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-purple-500/30 flex-shrink-0 mt-0.5" />
                          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-2.5 py-1.5">
                            <div className="text-[10px] font-mono text-purple-300">
                              调用: <span className="text-purple-200 font-semibold">{currentTool}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-gray-700/50 p-2">
                      <div className="flex items-center gap-1.5 bg-gray-800/50 rounded-lg px-2.5 py-1.5 border border-gray-700/50">
                        <span className="text-[10px] text-gray-500 flex-1">输入消息...</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Browser */}
            <div className="flex-1 min-w-0">
              <div className={`bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl border overflow-hidden flex flex-col transition-all duration-500 ${dataFlowActive ? 'border-[#3070f0]/55' : 'border-gray-700'}`} style={{ height: 460 }}>
                <div className="bg-gray-800/80 border-b border-gray-700">
                  <div className="px-3 py-2 flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    </div>
                    <div className="flex-1 bg-gray-900/50 rounded-lg px-2.5 py-1 text-[10px] text-gray-400 font-mono ml-1">
                      {browserUrl}
                    </div>
                    <div className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-all duration-300 ${dataFlowActive ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' : 'bg-gray-700 text-gray-500'}`}>
                      WebMCP
                    </div>
                  </div>
                </div>
                <div className="flex flex-1 flex-col min-h-0 overflow-hidden bg-[#f7f7f7] relative rounded-b-xl">
                  {mail163Active ? (
                    <>
                      {/* 163 邮箱：顶部品牌栏 */}
                      <div className="shrink-0 bg-[#d84640] text-white px-3 py-2 flex items-center gap-2 shadow-sm">
                        <span className="text-sm font-bold tracking-tight">网易邮箱</span>
                        <span className="text-[10px] opacity-90 px-1.5 py-0.5 rounded bg-white/15">6.0</span>
                        <div className="flex-1 max-w-[140px] ml-1 bg-white/95 rounded px-2 py-1 text-[10px] text-gray-500 flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-60">
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                          </svg>
                          <span className="truncate">搜索邮件</span>
                        </div>
                      </div>
                      <div className="flex flex-1 min-h-0">
                        <div className="w-[72px] shrink-0 bg-[#f0f0f0] border-r border-[#e0e0e0] py-2 flex flex-col gap-0.5 text-[10px]">
                          <div className="mx-1 px-1.5 py-1.5 rounded bg-white text-[#d84640] font-semibold shadow-sm border border-[#e8e8e8]">
                            收件箱
                          </div>
                          <div className="mx-1 px-1.5 py-1 text-gray-600">星标</div>
                          <div className="mx-1 px-1.5 py-1 text-gray-600">草稿箱</div>
                        </div>
                        <div className="flex-1 flex flex-col min-w-0 bg-white">
                          <div className="shrink-0 px-2 py-1.5 border-b border-[#eee] text-[10px] text-gray-500 flex justify-between">
                            <span>本月 · 联通 · 发票</span>
                            <span className="text-[#d84640] font-medium">共 3 封发票</span>
                          </div>
                          <div className="flex-1 overflow-y-auto">
                            {MAIL163_ROWS.map((row, i) => {
                              const invIdx = row.invoiceIdx
                              const isInvoice = invIdx !== undefined
                              const highlightInbox = phase === 'mail163-inbox' && isInvoice
                              const downloading = phase === 'mail163-download' && isInvoice && mail163DlStep === invIdx + 1
                              const downloaded = phase === 'mail163-download' && isInvoice && mail163DlStep > invIdx + 1
                              const highlightDl = phase === 'mail163-download' && isInvoice && (downloading || downloaded)
                              return (
                                <div
                                  key={i}
                                  className={`border-b border-[#f0f0f0] px-2.5 py-2 transition-all duration-500 ${
                                    highlightInbox || highlightDl ? 'bg-[#fff8f7] ring-2 ring-[#d84640]/35 ring-inset' : ''
                                  } ${downloading ? 'scale-[1.01]' : ''}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        {phase === 'mail163-download' && isInvoice && (
                                          <span
                                            className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                              downloaded
                                                ? 'border-[#d84640] bg-[#d84640] text-white'
                                                : downloading
                                                  ? 'border-[#d84640] border-dashed bg-white'
                                                  : 'border-[#ddd] bg-white'
                                            }`}
                                          >
                                            {downloaded && (
                                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                <path d="M20 6L9 17l-5-5" />
                                              </svg>
                                            )}
                                            {downloading && (
                                              <span className="h-1.5 w-1.5 rounded-full bg-[#d84640] animate-pulse" />
                                            )}
                                          </span>
                                        )}
                                        <span className={`text-[11px] font-semibold truncate ${isInvoice ? 'text-[#333]' : 'text-gray-600'}`}>{row.from}</span>
                                      </div>
                                      <div className="text-[11px] text-[#333] mt-0.5 line-clamp-1">{row.subject}</div>
                                      <div className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{row.snippet}</div>
                                    </div>
                                    <span className="text-[10px] text-gray-400 shrink-0">{row.date}</span>
                                  </div>
                                  {downloading && row.file && (
                                    <div className="mt-2 flex items-center gap-2 rounded-md bg-[#fafafa] border border-[#eee] px-2 py-1.5 animate-fade-in">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d84640" strokeWidth="1.5" className="shrink-0">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                      </svg>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[10px] font-medium text-[#333] truncate">{row.file}</div>
                                        <div className="h-1 mt-1 rounded-full bg-[#eee] overflow-hidden">
                                          <div
                                            key={`dl-${invIdx}-${mail163DlStep}`}
                                            className="h-full rounded-full bg-[#d84640] origin-left animate-mail163-progress-fast"
                                            style={{ width: '100%' }}
                                          />
                                        </div>
                                      </div>
                                      <span className="text-[9px] text-[#d84640] font-semibold whitespace-nowrap">下载中</span>
                                    </div>
                                  )}
                                  {downloaded && row.file && !downloading && (
                                    <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-[#2e7d32]">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M20 6L9 17l-5-5" />
                                      </svg>
                                      <span className="truncate font-medium">{row.file}</span>
                                      <span className="text-gray-400 shrink-0">已保存</span>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          {phase === 'mail163-download' && mail163DlStep >= 1 && mail163DlStep < 4 && (
                            <div className="shrink-0 mx-2 mb-1 mt-1 rounded-lg bg-[#fff8e6] border border-[#ffe082] px-2.5 py-1.5 text-[10px] text-[#856404] flex items-center gap-1.5">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#d84640] animate-pulse shrink-0" />
                              正在下载第 {Math.min(mail163DlStep, 3)} / 3 张联通电子发票…
                            </div>
                          )}
                          {phase === 'mail163-download' && mail163DlStep >= 4 && (
                            <div className="shrink-0 mx-2 mb-2 mt-1 rounded-lg bg-[#e8f5e9] border border-[#a5d6a7] px-2.5 py-1.5 text-[10px] text-[#2e7d32] flex items-center gap-1.5 animate-fade-in">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                              3 个 PDF 已保存到下载文件夹，准备打开范妮思上传…
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* FilterBar：全部类型 / 全部月份（对齐 FilterBar.vue + Vant） */}
                      <div className="flex shrink-0 bg-white border-b border-[#ebedf0]">
                        <button
                          type="button"
                          className="flex-1 flex items-center justify-center gap-1 py-3 text-[13px] text-[#323233] border-r border-[#ebedf0]"
                        >
                          全部类型
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#969799] opacity-80">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="flex-1 flex items-center justify-center gap-1 py-3 text-[13px] text-[#323233]"
                        >
                          全部月份
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#969799] opacity-80">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto px-[15px] pt-4 pb-2 min-h-0">
                        <p className="text-[13px] text-[#757575] text-center leading-5 mb-3">
                          已关联发票不在这里展示，可点击去报销查看
                        </p>
                        {showOrders ? (
                          <div className="flex flex-col gap-3">
                            {KABAO_INVOICES.map((inv, i) => (
                              <div
                                key={i}
                                className={`rounded-lg bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-300 ${
                                  openedOrder === i ? 'ring-2 ring-[#3070f0] bg-[rgba(48,112,240,0.02)]' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[15px] font-medium text-[#0F121E] leading-[23px] shrink-0">
                                      {inv.amount}元
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs pl-1 ${typePillClass(inv.type)}`}
                                    >
                                      {inv.label}
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-70">
                                        <path d="M6 9l6 6 6-6" />
                                      </svg>
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-2 space-y-1 text-[13px]">
                                  <div className="flex items-start gap-2">
                                    <span className="text-[#757575] shrink-0 w-14">发票号</span>
                                    <span className="text-[#757575] break-all flex-1 flex items-center gap-1">
                                      {inv.invoiceNumber}
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#757575] shrink-0 opacity-70" aria-hidden>
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                      </svg>
                                    </span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-[#757575] shrink-0 w-14">开票日</span>
                                    <span className="text-[#757575] break-all flex-1">{inv.invoiceDate}</span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-[#757575] shrink-0 w-14">销售方</span>
                                    <span className="text-[#757575] break-all flex-1">{inv.seller}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : browserUrl !== 'about:blank' ? (
                          <div className="flex flex-col items-center justify-center py-10 text-[13px] text-[#969799]">
                            加载中...
                          </div>
                        ) : null}
                      </div>

                      {/* index.vue 底部操作栏：上传发票 + 去报销 */}
                      <div className="shrink-0 flex gap-[15px] px-4 pt-4 pb-3 bg-white border-t border-[#F0F0F0]">
                        <div className="flex-1 min-w-0">
                          <div
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg text-base font-normal text-white bg-[#3070f0]"
                            style={{ borderRadius: 8 }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                              <path d="M12 16V4m0 0L8 8m4-4l4 4" />
                              <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                            </svg>
                            上传发票
                          </div>
                        </div>
                        <div
                          className="flex flex-1 min-w-0 h-12 items-center justify-center gap-1 rounded-lg text-base text-[#3070F0] bg-[#DDE8FF]"
                          style={{ borderRadius: 8 }}
                        >
                          去报销
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#3070F0]">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </>
                  )}

                  {phase === 'upload-invoice-sheet' && (
                    <div className="absolute inset-0 z-[11] flex flex-col justify-end pointer-events-none">
                      <div className="absolute inset-0 bg-black/45 pointer-events-auto" aria-hidden />
                      <div className="relative pointer-events-auto animate-upload-sheet-up bg-white rounded-t-[14px] px-4 pt-3 pb-5 shadow-[0_-6px_28px_rgba(0,0,0,0.12)] border-t border-[#f0f0f0]">
                        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[#e5e5e5]" aria-hidden />
                        <h2 className="text-center text-[17px] font-bold text-[#323233] tracking-tight mb-4">
                          上传发票
                        </h2>
                        <div className="flex flex-col gap-3">
                          <div
                            className="flex w-full items-center gap-3 rounded-[10px] border border-[#ebebeb] bg-white px-3 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)] text-left"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#f5f5f5]">
                              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <path d="M9 13h6M9 17h4" opacity="0.45" />
                                <path d="M10 6.5h4.5v4H10z" fill="none" stroke="#1a1a1a" strokeWidth="1.1" />
                                <path d="M11 8.2h2.2M11 9.4h2.2" stroke="#1a1a1a" strokeWidth="0.9" opacity="0.6" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[15px] font-medium text-[#323233] leading-snug">电子发票上传</div>
                              <div className="mt-0.5 text-[12px] text-[#969799] leading-snug">选择上传文件</div>
                            </div>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8c9cc" strokeWidth="2" className="shrink-0" aria-hidden>
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </div>
                          <div
                            className="flex w-full items-center gap-3 rounded-[10px] border border-[#ebebeb] bg-white px-3 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)] text-left"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#f5f5f5]">
                              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M7 4h10l1 3v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
                                <path d="M6 7h12" />
                                <path d="M8 10h8M8 13h6M8 16h7" opacity="0.45" />
                                <path d="M5 19h14l-1.5 3h-11L5 19z" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[15px] font-medium text-[#323233] leading-snug">纸质发票上传</div>
                              <div className="mt-0.5 text-[12px] text-[#969799] leading-snug">拍照/相册</div>
                            </div>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8c9cc" strokeWidth="2" className="shrink-0" aria-hidden>
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {phase === 'classify-modal' && (
                    <div className="absolute inset-0 z-[12] flex items-center justify-center bg-black/45 px-4">
                      <div className="w-full max-w-[280px] overflow-hidden rounded-2xl bg-white shadow-xl">
                        <div className="border-b border-gray-100 py-3.5 text-center text-base font-semibold text-[#323233]">
                          发票归类
                        </div>
                        <div className="divide-y divide-gray-100 px-4 py-1">
                          {CLASSIFY_ROWS.map((row, idx) => (
                            <div key={idx} className="py-3">
                              <div className="flex items-center justify-between text-sm text-[#323233]">
                                <span className="font-medium">{row.title}</span>
                                <span className="text-[#969799]">{row.period}</span>
                              </div>
                              <div className="mt-1 font-mono text-xs text-[#646566] break-all">{row.no}</div>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="w-full border-t border-gray-100 py-3 text-sm font-medium text-[#3070f0]"
                        >
                          我知道了
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Data flow bar */}
        <div className="mt-5 flex items-center justify-center gap-2">
          {[
            { label: '企业微信', sub: '消息通道', color: '[#1989FA]' },
            { label: 'WeWorker', sub: 'AI 助理', color: 'accent' },
            { label: 'Chrome 扩展', sub: 'WeWorker Browser Adapter', color: 'emerald' },
          ].map((node, i, arr) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`bg-surface/90 backdrop-blur border rounded-xl px-3.5 py-2.5 shadow-lg transition-all duration-500 ${dataFlowActive ? 'border-accent/45 scale-105' : 'border-border'}`}>
                <div className={`text-sm font-semibold transition-colors duration-500 ${dataFlowActive ? 'text-accent' : 'text-[rgb(var(--color-text))]'}`}>{node.label}</div>
                <div className="text-xs text-muted font-mono mt-0.5">{node.sub}</div>
              </div>
              {i < arr.length - 1 && (
                <div className="flex items-center gap-1">
                  <div className={`w-8 h-0.5 transition-all duration-500 ${dataFlowActive ? 'bg-gradient-to-r from-accent to-purple-400' : 'bg-border'}`} />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-colors duration-500 ${dataFlowActive ? 'text-accent' : 'text-muted'}`}>
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        @keyframes mail163-progress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .animate-mail163-progress {
          transform: scaleX(0);
          transform-origin: left center;
          animation: mail163-progress 2.4s ease-out forwards;
        }
        .animate-mail163-progress-fast {
          transform: scaleX(0);
          transform-origin: left center;
          animation: mail163-progress 0.58s ease-out forwards;
        }
        @keyframes upload-sheet-up {
          from { transform: translateY(18px); opacity: 0.92; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-upload-sheet-up {
          animation: upload-sheet-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>
    </div>
  )
}

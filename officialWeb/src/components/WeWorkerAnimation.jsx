import { useEffect, useRef, useState } from 'react'

const MSG_TEXT = `帮我规划本周末上海→杭州的短途出行：
step1：在小红书搜「杭州周末徒步/攻略」，整理 3 条笔记要点
step2：在携程查同周末的机票，以及 2–3 个跟团/自由行产品
step3：在 12306 查周六上海虹桥→杭州东高铁余票与车次
step4：汇总玩法、交通与预算对比，标出需登录后再确认的项`

const STEPS = [
  { id: 'wecom-typing', duration: 9000, phase: 'wecom-input' },
  { id: 'wecom-sent', duration: 250, phase: 'wecom-sent' },
  { id: 'ww-receive', duration: 300, phase: 'ww-receive' },
  { id: 'ww-thinking', duration: 450, phase: 'ww-thinking' },
  { id: 'open-browser-xhs', duration: 1200, phase: 'tool-call', tool: 'open_browser' },
  { id: 'xhs-browser', duration: 2200, phase: 'browser-xhs' },
  { id: 'xhs-search', duration: 1800, phase: 'tool-call', tool: 'xiaohongshu.com.search_notes' },
  { id: 'xhs-note', duration: 1600, phase: 'tool-call', tool: 'xiaohongshu.com.open_note' },
  { id: 'open-browser-ctrip', duration: 1200, phase: 'tool-call', tool: 'open_browser' },
  { id: 'ctrip-browser', duration: 2400, phase: 'browser-ctrip' },
  { id: 'ctrip-flight', duration: 1800, phase: 'tool-call', tool: 'ctrip.com.flight' },
  { id: 'ctrip-tour', duration: 1600, phase: 'tool-call', tool: 'ctrip.com.tour' },
  { id: 'open-browser-12306', duration: 1200, phase: 'tool-call', tool: 'open_browser' },
  { id: 'rail-browser', duration: 2400, phase: 'browser-12306' },
  { id: 'rail-trains', duration: 1800, phase: 'tool-call', tool: '12306.cn.trains' },
  { id: 'ww-response', duration: 2800, phase: 'ww-response' },
  { id: 'wecom-notify', duration: 2500, phase: 'wecom-notify' },
  { id: 'done', duration: 1500, phase: 'complete' },
]

const AI_THOUGHTS = [
  '收到企业微信消息…',
  '小红书搜攻略 → 携程查机票/跟团 → 12306 查高铁，再汇总对比',
  '未登录站点仅做公开检索；下单/支付需你在浏览器确认',
]

/** 示意数据（占位城市/价格，非真实订单） */
const XHS_NOTES = [
  { title: '杭州周末轻徒步｜九溪烟树一日线', author: '示例用户A', likes: '1.2万', tag: '徒步' },
  { title: '西湖+灵隐慢游｜不踩雷时间表', author: '示例用户B', likes: '8.6k', tag: '攻略' },
  { title: '杭州东站周边美食地图', author: '示例用户C', likes: '5.1k', tag: '美食' },
]

const CTRIP_FLIGHTS = [
  { route: '上海虹桥 → 杭州萧山', time: '周六 08:10–09:05', price: '¥420 起', tag: '直飞' },
  { route: '上海浦东 → 杭州萧山', time: '周六 14:30–15:35', price: '¥380 起', tag: '经济舱' },
]

const CTRIP_TOURS = [
  { name: '杭州西湖+灵隐 2 日跟团', price: '¥899/人', meta: '含酒店 · 无购物' },
  { name: '杭州自由行机+酒套餐', price: '¥1280/人', meta: '可改期 · 需登录确认' },
]

const TRAINS_12306 = [
  { no: 'G7351', depart: '08:12', arrive: '09:08', seat: '二等座', tickets: '有票' },
  { no: 'G7313', depart: '10:05', arrive: '10:58', seat: '二等座', tickets: '有票' },
  { no: 'D2289', depart: '13:20', arrive: '14:35', seat: '二等座', tickets: '候补' },
]

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

export default function WeWorkerAnimation({ paused = false }) {
  const [stepIdx, setStepIdx] = useState(0)
  const [running, setRunning] = useState(true)
  const [aiThoughts, setAiThoughts] = useState([])
  const [wwMessages, setWwMessages] = useState([])   // messages in WeWorker chat
  const [currentTool, setCurrentTool] = useState(null)
  const [browserUrl, setBrowserUrl] = useState('about:blank')
  const [wecomNotify, setWecomNotify] = useState(false)
  const timerRef = useRef(null)
  /** 企业微信打字完成后只触发一次：立刻同步 WeWorker 并跳过中间等待步骤 */
  const wecomHandoffRef = useRef(false)

  const step = STEPS[stepIdx]
  const typingActive = running && step?.phase === 'wecom-input'
  const { displayed: typedText, done: typingDone } = useTypewriter(MSG_TEXT, typingActive, 22)

  useEffect(() => {
    setRunning(!paused)
  }, [paused])

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
    else setCurrentTool(null)
    if (step.id === 'open-browser-xhs' || step.phase === 'browser-xhs') setBrowserUrl('www.xiaohongshu.com')
    if (step.id === 'open-browser-ctrip' || step.phase === 'browser-ctrip') setBrowserUrl('www.ctrip.com')
    if (step.id === 'open-browser-12306' || step.phase === 'browser-12306') setBrowserUrl('www.12306.cn')
    if (step.phase === 'ww-response') {
      setWwMessages(p => [...p, {
        role: 'assistant',
        text: '✓ 跨站检索完成（示意汇总）\n\n【玩法】九溪轻徒步 / 西湖+灵隐慢游 / 东站周边美食\n【交通】高铁 G7351 08:12 二等座有票 ≈¥73；机票 ¥380–420 起\n【跟团】西湖灵隐 2 日 ¥899；机+酒自由行 ¥1280（需登录确认库存）\n\n建议：时间紧选高铁+小红书路线；想省心可看跟团。下单与支付请你在浏览器确认。',
      }])
    }
    if (step.phase === 'wecom-notify') setWecomNotify(true)

    timerRef.current = setTimeout(() => {
      const next = stepIdx + 1
      if (next >= STEPS.length) {
        setTimeout(() => {
          setStepIdx(0); setAiThoughts([]); setWwMessages([])
          setCurrentTool(null)
          setBrowserUrl('about:blank'); setWecomNotify(false)
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

  const travelBrowserActive = ['browser-xhs', 'browser-ctrip', 'browser-12306'].includes(phase)
  const dataFlowActive = phase === 'tool-call' || travelBrowserActive
  const wecomSent = ['wecom-sent', 'ww-receive', 'ww-thinking', 'tool-call',
    'browser-xhs', 'browser-ctrip', 'browser-12306', 'ww-response', 'wecom-notify', 'complete'].includes(phase)

  const xhsHighlightNotes = ['xhs-search', 'xhs-note'].includes(step?.id) || phase === 'browser-ctrip' || phase === 'browser-12306'
  const xhsHighlightFirst = step?.id === 'xhs-note'
  const ctripHighlightFlight = step?.id === 'ctrip-flight' || step?.id === 'ctrip-tour'
  const ctripHighlightTour = step?.id === 'ctrip-tour'
  const railHighlight = step?.id === 'rail-trains' || phase === 'ww-response' || phase === 'wecom-notify'

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
                        ✅ 出行方案已汇总<br/>
                        <span className="text-gray-500">推荐高铁 G7351 + 九溪徒步；机票/跟团价已对比，详情见 WeWorker 对话</span>
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
                  {browserUrl === 'www.xiaohongshu.com' ? (
                    <>
                      <div className="shrink-0 bg-white border-b border-[#eee] px-3 py-2 flex items-center gap-2">
                        <span className="text-[#ff2442] text-sm font-bold">小红书</span>
                        <div className="flex-1 bg-[#f5f5f5] rounded-full px-3 py-1.5 text-[11px] text-[#333] flex items-center gap-1.5">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                          <span className="truncate">杭州周末徒步 攻略</span>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 bg-[#fafafa]">
                        {XHS_NOTES.map((note, i) => (
                          <div
                            key={i}
                            className={`rounded-xl bg-white p-2.5 border transition-all duration-500 ${
                              xhsHighlightNotes ? 'border-[#ff2442]/30 shadow-sm' : 'border-[#eee]'
                            } ${xhsHighlightFirst && i === 0 ? 'ring-2 ring-[#ff2442]/40' : ''}`}
                          >
                            <div className="flex gap-2">
                              <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-[#ffe8ec] to-[#fff0e6] shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-semibold text-[#333] line-clamp-2 leading-snug">{note.title}</div>
                                <div className="mt-1 flex items-center gap-2 text-[9px] text-gray-400">
                                  <span>{note.author}</span>
                                  <span className="text-[#ff2442]">♥ {note.likes}</span>
                                  <span className="px-1 py-0.5 rounded bg-[#fff0f2] text-[#ff2442]">{note.tag}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {xhsHighlightNotes && (
                          <div className="text-[10px] text-center text-[#2e7d32] py-1 animate-fade-in">
                            Adapter 已返回 3 条笔记摘要，正在打开首条详情…
                          </div>
                        )}
                      </div>
                    </>
                  ) : browserUrl === 'www.ctrip.com' ? (
                    <>
                      <div className="shrink-0 bg-[#0086f6] text-white px-3 py-2 flex items-center gap-2">
                        <span className="text-sm font-bold">携程旅行</span>
                        <span className="text-[10px] opacity-90">上海 → 杭州 · 本周末</span>
                      </div>
                      <div className="flex shrink-0 bg-white border-b border-[#e8e8e8] text-[11px]">
                        {['机票', '跟团游', '自由行'].map((tab, ti) => (
                          <div
                            key={tab}
                            className={`flex-1 text-center py-2 ${ti <= 1 ? 'border-r border-[#eee]' : ''} ${
                              (ti === 0 && ctripHighlightFlight) || (ti === 1 && ctripHighlightTour) ? 'text-[#0086f6] font-semibold border-b-2 border-[#0086f6]' : 'text-gray-600'
                            }`}
                          >
                            {tab}
                          </div>
                        ))}
                      </div>
                      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                        <div className="text-[10px] text-gray-500 font-medium px-0.5">机票</div>
                        {CTRIP_FLIGHTS.map((f, i) => (
                          <div
                            key={i}
                            className={`rounded-lg bg-white border p-2.5 transition-all duration-300 ${
                              ctripHighlightFlight && i === 0 ? 'border-[#0086f6] ring-2 ring-[#0086f6]/25' : 'border-[#eee]'
                            }`}
                          >
                            <div className="text-[11px] font-medium text-[#333]">{f.route}</div>
                            <div className="flex justify-between mt-1 text-[10px]">
                              <span className="text-gray-500">{f.time}</span>
                              <span className="text-[#0086f6] font-semibold">{f.price}</span>
                            </div>
                          </div>
                        ))}
                        <div className="text-[10px] text-gray-500 font-medium px-0.5 pt-1">跟团 / 套餐</div>
                        {CTRIP_TOURS.map((t, i) => (
                          <div
                            key={i}
                            className={`rounded-lg bg-white border p-2.5 transition-all duration-300 ${
                              ctripHighlightTour ? 'border-[#0086f6] ring-2 ring-[#0086f6]/25' : 'border-[#eee]'
                            }`}
                          >
                            <div className="text-[11px] font-medium text-[#333]">{t.name}</div>
                            <div className="flex justify-between mt-1 text-[10px]">
                              <span className="text-gray-500">{t.meta}</span>
                              <span className="text-[#ff6600] font-semibold">{t.price}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : browserUrl === 'www.12306.cn' ? (
                    <>
                      <div className="shrink-0 bg-[#3b99fc] text-white px-3 py-2">
                        <span className="text-sm font-bold">12306</span>
                        <span className="text-[10px] ml-2 opacity-95">余票查询</span>
                      </div>
                      <div className="shrink-0 bg-white border-b border-[#ddd] px-3 py-2 text-[11px] flex flex-wrap gap-x-3 gap-y-1 text-[#333]">
                        <span>上海虹桥 → 杭州东</span>
                        <span className="text-gray-500">2026-10-17（周六）</span>
                        <span className="text-[#3b99fc]">二等座</span>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 px-2 py-1.5 bg-[#eef5ff] text-[9px] text-gray-600 font-medium">
                          <span>车次</span><span>出发</span><span>到达</span><span>余票</span>
                        </div>
                        {TRAINS_12306.map((t, i) => (
                          <div
                            key={t.no}
                            className={`grid grid-cols-[auto_1fr_1fr_auto] gap-2 px-2 py-2 border-b border-[#eee] text-[11px] transition-all duration-300 ${
                              railHighlight && i === 0 ? 'bg-[#e8f4ff] ring-1 ring-[#3b99fc]/40 ring-inset' : 'bg-white'
                            }`}
                          >
                            <span className="font-semibold text-[#333]">{t.no}</span>
                            <span>{t.depart}</span>
                            <span>{t.arrive}</span>
                            <span className={t.tickets === '有票' ? 'text-[#2e7d32] font-medium' : 'text-[#ff9800]'}>{t.tickets}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : browserUrl !== 'about:blank' ? (
                    <div className="flex flex-1 items-center justify-center text-[13px] text-[#969799]">
                      正在打开站点…
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center text-[12px] text-[#bbb]">
                      等待 Adapter 打开浏览器
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
            { label: 'Chrome 扩展', sub: 'WebMCP Adapter', color: 'emerald' },
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
      `}</style>
    </div>
  )
}

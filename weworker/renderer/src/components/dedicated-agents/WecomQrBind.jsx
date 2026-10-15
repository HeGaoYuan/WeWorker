import React, { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Alert, Button, Input, Space } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'
import { pollWecomQr, startWecomQr } from '../../api/dedicated-agents-api.js'
import { hintStyle, labelStyle, qrBoxStyle } from './styles.js'

const POLL_INTERVAL_MS = 3000

/**
 * Scan with WeCom to create a new AI bot or authorize an existing one.
 * Calls onBound({ qr_session_id }) after a successful scan, or
 * onBound({ bot_id, secret }) when the user enters credentials manually.
 * The bot secret from a scan never reaches the renderer.
 */
export default function WecomQrBind({ onBound, busy = false, autoStart = true }) {
  const [state, setState] = useState('idle') // idle | loading | waiting | success | expired | error
  const [message, setMessage] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState({ bot_id: '', secret: '' })
  const canvasRef = useRef(null)
  const timerRef = useRef(null)
  const expireRef = useRef(null)
  const mountedRef = useRef(true)
  const onBoundRef = useRef(onBound)
  onBoundRef.current = onBound

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (expireRef.current) clearTimeout(expireRef.current)
    timerRef.current = null
    expireRef.current = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stop()
    }
  }, [stop])

  useEffect(() => {
    if (!qrUrl || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, qrUrl, { width: 196, margin: 1 }, (error) => {
      if (error) console.error('[dedicated-agents] QR render error:', error)
    })
  }, [qrUrl, state])

  const start = useCallback(async () => {
    stop()
    setState('loading')
    setMessage('')
    setQrUrl('')
    try {
      const session = await startWecomQr()
      if (!mountedRef.current) return
      setQrUrl(session.qr_url)
      setState('waiting')
      expireRef.current = setTimeout(() => {
        stop()
        if (!mountedRef.current) return
        setState('expired')
        setQrUrl('')
      }, (session.expires_in || 300) * 1000)
      timerRef.current = setInterval(async () => {
        try {
          const result = await pollWecomQr(session.session_id)
          if (!mountedRef.current) return
          if (result.status === 'success') {
            stop()
            setState('success')
            setQrUrl('')
            setMessage(`已获取机器人（BotID：${result.bot_id}）`)
            onBoundRef.current?.({ qr_session_id: session.session_id, bot_id: result.bot_id })
          } else if (result.status === 'expired') {
            stop()
            setState('expired')
            setQrUrl('')
          }
        } catch {
          // Keep polling through transient failures.
        }
      }, POLL_INTERVAL_MS)
    } catch (error) {
      if (!mountedRef.current) return
      setState('error')
      setMessage(error.message || '获取二维码失败')
    }
  }, [stop])

  useEffect(() => {
    if (autoStart) start()
    // Start once on mount; `start` is stable enough for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitManual = () => {
    const bot_id = manual.bot_id.trim()
    const secret = manual.secret.trim()
    if (!bot_id || !secret) {
      setMessage('请同时填写 BotID 和 Secret')
      setState('error')
      return
    }
    stop()
    onBoundRef.current?.({ bot_id, secret })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ ...qrBoxStyle, width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
          {state === 'waiting' && qrUrl && <canvas ref={canvasRef} aria-label="企业微信扫码二维码" />}
          {state === 'loading' && <LoadingOutlined style={{ fontSize: 28, color: '#999' }} />}
          {(state === 'expired' || state === 'error' || state === 'idle') && (
            <Button onClick={start}>{state === 'idle' ? '获取二维码' : '刷新二维码'}</Button>
          )}
          {state === 'success' && <span style={{ color: '#16a34a', fontSize: 40 }} aria-label="扫码成功">✓</span>}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            {state === 'success' ? '扫码成功' : '用企业微信扫一扫'}
          </div>
          <ol style={{ ...hintStyle, paddingLeft: 18, margin: '0 0 12px' }}>
            <li>打开手机企业微信，扫描左侧二维码</li>
            <li>选择「创建机器人」，或选择一个已有的机器人授权</li>
            <li>确认后这里会自动进入下一步</li>
          </ol>
          <div style={hintStyle}>一个机器人只能连接一个 Agent。建议为每个专属 Agent 单独创建一个机器人，并起一个好认的名字。</div>
          {state === 'expired' && <div style={{ ...hintStyle, color: 'var(--warning, #f59e0b)', marginTop: 8 }}>二维码已过期，请刷新后重新扫码。</div>}
          {message && (
            <div style={{ ...hintStyle, marginTop: 8, color: state === 'error' ? 'var(--error, #ef4444)' : 'var(--success, #22c55e)' }}>{message}</div>
          )}
          {busy && <div style={{ ...hintStyle, marginTop: 8 }}><LoadingOutlined /> 正在保存…</div>}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setManualOpen((value) => !value)} aria-expanded={manualOpen}>
          {manualOpen ? '收起手动填写' : '扫码不方便？手动填写 BotID 和 Secret'}
        </Button>
        {manualOpen && (
          <div style={{ marginTop: 10, maxWidth: 420 }}>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 10 }}
              message="在企业微信「工作台 → 智能机器人」中创建 API 模式机器人，选择「通过长连接配置」后可获取 BotID 和 Secret。"
            />
            <label style={labelStyle} htmlFor="agent-bot-id">BotID</label>
            <Input id="agent-bot-id" value={manual.bot_id} onChange={(event) => setManual((value) => ({ ...value, bot_id: event.target.value }))} placeholder="智能机器人 BotID" style={{ marginBottom: 10 }} />
            <label style={labelStyle} htmlFor="agent-bot-secret">Secret</label>
            <Input.Password id="agent-bot-secret" value={manual.secret} onChange={(event) => setManual((value) => ({ ...value, secret: event.target.value }))} placeholder="长连接 Secret" style={{ marginBottom: 10 }} autoComplete="off" />
            <Space>
              <Button type="primary" onClick={submitManual} disabled={busy}>使用这个机器人</Button>
            </Space>
          </div>
        )}
      </div>
    </div>
  )
}

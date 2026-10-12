import { afterEach, describe, expect, it } from 'vitest'
import http from 'http'
import fs from 'node:fs'
import { performApiReplayRequest } from '../bridge.js'

const servers = []

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      servers.push(server)
      resolve(server.address().port)
    })
  })
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
  })
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

describe('api replay request', () => {
  it('sends a Node-side request with browser cookie headers', async () => {
    let observed = null
    const server = http.createServer(async (req, res) => {
      observed = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: await readBody(req),
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ retCode: 0, data: { ok: true } }))
    })
    const port = await listen(server)

    const result = await performApiReplayRequest({
      url: `http://127.0.0.1:${port}/api/list`,
      method: 'POST',
      headers: {
        Cookie: 'sid=abc; user=steven',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: '{"pageSize":1}',
    })

    expect(result.ok).toBe(true)
    expect(result.response.status).toBe(200)
    expect(JSON.parse(result.response.body)).toEqual({ retCode: 0, data: { ok: true } })
    expect(observed).toMatchObject({
      method: 'POST',
      url: '/api/list',
      body: '{"pageSize":1}',
    })
    expect(observed.headers.cookie).toBe('sid=abc; user=steven')
    expect(observed.headers['x-requested-with']).toBe('XMLHttpRequest')
  })

  it('filters hop-by-hop and transport-owned headers', async () => {
    let observedHeaders = null
    const server = http.createServer((req, res) => {
      observedHeaders = req.headers
      res.end('ok')
    })
    const port = await listen(server)

    const result = await performApiReplayRequest({
      url: `http://127.0.0.1:${port}/`,
      headers: {
        Host: 'evil.example',
        Connection: 'close',
        'X-Test': 'kept',
      },
    })

    expect(result.ok).toBe(true)
    expect(observedHeaders.host).toBe(`127.0.0.1:${port}`)
    expect(observedHeaders.connection).not.toBe('close')
    expect(observedHeaders['x-test']).toBe('kept')
  })

  it('falls back to curl when Node fetch cannot reach the endpoint', async () => {
    let observed = null
    const server = http.createServer(async (req, res) => {
      observed = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: await readBody(req),
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, via: 'curl' }))
    })
    const port = await listen(server)

    const result = await performApiReplayRequest(
      {
        url: `http://127.0.0.1:${port}/api/fallback`,
        method: 'POST',
        headers: {
          Cookie: 'sid=abc',
          'Content-Type': 'application/json',
        },
        body: '{"hello":"world"}',
      },
      {
        fetchImpl: async () => {
          const err = new Error('fetch failed')
          err.cause = { code: 'SELF_SIGNED_CERT_IN_CHAIN', message: 'certificate rejected' }
          throw err
        },
      },
    )

    expect(result.ok).toBe(true)
    expect(result.response.status).toBe(200)
    expect(result.response.replay.transport).toBe('curl')
    expect(result.response.replay.fetchError).toContain('fetch failed')
    expect(JSON.parse(result.response.body)).toEqual({ ok: true, via: 'curl' })
    expect(observed).toMatchObject({
      method: 'POST',
      url: '/api/fallback',
      body: '{"hello":"world"}',
    })
    expect(observed.headers.cookie).toBe('sid=abc')
    expect(observed.headers['content-type']).toBe('application/json')
  })

  it('does not follow redirects in curl fallback when manual handling is requested', async () => {
    const visited = []
    const server = http.createServer((req, res) => {
      visited.push(req.url)
      if (req.url === '/start') {
        res.writeHead(302, { Location: '/target' })
        res.end()
      } else {
        res.end('unexpected')
      }
    })
    const port = await listen(server)
    const result = await performApiReplayRequest(
      { url: `http://127.0.0.1:${port}/start`, redirect: 'manual' },
      { fetchImpl: async () => { throw new Error('fixture fetch failure') } },
    )
    expect(result.ok).toBe(true)
    expect(result.response.status).toBe(302)
    expect(visited).toEqual(['/start'])
  })

  it('keeps Windows Schannel revocation checks from breaking curl fallback', () => {
    const bridgeSource = fs.readFileSync(new URL('../bridge.js', import.meta.url), 'utf8')

    expect(bridgeSource).toContain("'ssl-no-revoke'")
    expect(bridgeSource).not.toContain("'insecure'")
    expect(bridgeSource).not.toContain('"insecure"')
  })
})

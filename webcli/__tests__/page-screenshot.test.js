import { test } from 'vitest'
import assert from 'node:assert/strict'
import { PAGE_SCREENSHOT_LIMITS, capturePage, jpegSize, screenshotClip } from '../page-screenshot.js'

/** Minimal JPEG header (SOI, APP0, SOF0, EOI) reporting `width`×`height`. */
function fakeJpeg(width, height) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]
  return Buffer.from([0xff, 0xd8, ...app0, 0xff, 0x01, ...sof0, 0xff, 0xd9]).toString('base64')
}

const metrics = (overrides = {}) => ({
  cssVisualViewport: { pageX: 0, pageY: 640, clientWidth: 1280, clientHeight: 720 },
  cssContentSize: { width: 1280, height: 3000 },
  ...overrides,
})

test('reads JPEG dimensions and rejects other data', () => {
  assert.deepEqual(jpegSize(fakeJpeg(1200, 675)), { width: 1200, height: 675 })
  assert.equal(jpegSize(Buffer.from('not a jpeg').toString('base64')), null)
  assert.equal(jpegSize(''), null)
})

test('the viewport clip follows the scroll position and fits 1200×800', () => {
  const clip = screenshotClip(metrics())
  assert.deepEqual({ ...clip, scale: Number(clip.scale.toFixed(4)) }, { x: 0, y: 640, width: 1280, height: 720, scale: 0.9375 })
  // Small viewports are not enlarged.
  assert.equal(screenshotClip(metrics({ cssVisualViewport: { clientWidth: 800, clientHeight: 600 } })).scale, 1)
  // Missing metrics still give a usable clip.
  assert.deepEqual(screenshotClip({}), { x: 0, y: 0, width: 1280, height: 800, scale: 0.9375 })
})

test('a full-page clip starts at the top and cuts very tall pages', () => {
  const clip = screenshotClip(metrics(), { fullPage: true })
  assert.equal(clip.y, 0)
  assert.equal(clip.height, 3000)
  const tall = screenshotClip(metrics({ cssContentSize: { width: 1200, height: 50000 } }), { fullPage: true })
  assert.equal(tall.height, PAGE_SCREENSHOT_LIMITS.fullPageMaxHeight)
  assert.equal(tall.scale, 1)
})

test('captures through the session with a clip and reports the image size', async () => {
  const sent = []
  const send = async (method, params) => {
    sent.push([method, params])
    return method === 'Page.getLayoutMetrics' ? metrics() : { data: fakeJpeg(1200, 675) }
  }
  const lines = []
  const shot = await capturePage(send, { log: (line) => lines.push(line) })
  assert.equal(shot.width, 1200)
  assert.equal(shot.height, 675)
  assert.equal(shot.crop.cropped, true)
  assert.deepEqual(sent.map(([method]) => method), ['Page.getLayoutMetrics', 'Page.captureScreenshot'])
  assert.equal(sent[1][1].format, 'jpeg')
  assert.equal(sent[1][1].captureBeyondViewport, undefined)
  assert.ok(lines[0].startsWith('Page.captureScreenshot done'))
})

test('an image enlarged by the device pixel ratio is captured again within the limits', async () => {
  const scales = []
  const send = async (method, params) => {
    if (method === 'Page.getLayoutMetrics') return metrics()
    scales.push(params.clip.scale)
    // Device pixel ratio 1.5.
    return { data: fakeJpeg(Math.round(1280 * params.clip.scale * 1.5), Math.round(720 * params.clip.scale * 1.5)) }
  }
  const shot = await capturePage(send)
  assert.equal(scales.length, 2)
  assert.ok(shot.width <= 1201 && shot.height <= 801, `${shot.width}x${shot.height}`)
})

test('a page that never paints fails with a step timeout instead of hanging', async () => {
  const send = async (method) => (method === 'Page.getLayoutMetrics' ? metrics() : new Promise(() => {}))
  await assert.rejects(
    capturePage(send, { timeouts: { metrics: 50, capture: 20 } }),
    (error) => error.code === 'SCREENSHOT_TIMEOUT' && error.step === 'Page.captureScreenshot',
  )
  await assert.rejects(capturePage(async () => ({}), { timeouts: { metrics: 50, capture: 50 } }), /未返回图片/)
})

/**
 * Page screenshots over a CDP session on the WeWorker 浏览器 pipe.
 *
 * Unlike chrome.debugger in the extension, this shows no "being debugged" bar
 * on the page and cannot collide with the extension's own debugger sessions.
 * Each step has a timeout, so a page that never paints fails within bounded
 * time instead of hanging the call.
 *
 * Output matches the extension's capture: JPEG within 1200×800 (full page:
 * 1200 wide, at most 6000 high), scaled by Chrome rather than re-encoded here.
 */

export const PAGE_SCREENSHOT_LIMITS = Object.freeze({ maxWidth: 1200, maxHeight: 800, fullPageMaxHeight: 6000, quality: 80 });
export const PAGE_SCREENSHOT_TIMEOUT_MS = Object.freeze({ metrics: 5000, capture: 15000 });

function withTimeout(promise, ms, step) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(`${step} 超时（${ms} ms）`), { code: 'SCREENSHOT_TIMEOUT', step }));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Pixel size from a base64 JPEG's SOF header, or null. */
export function jpegSize(base64) {
  let bytes;
  try {
    bytes = Buffer.from(String(base64 || ''), 'base64');
  } catch {
    return null;
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    // Fill bytes and markers without a length field.
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { offset += 2; continue; }
    const length = bytes.readUInt16BE(offset + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/** Clip (CSS pixels) for the visible viewport or the whole page, scaled down to the limits. */
export function screenshotClip(metrics = {}, { fullPage = false, limits = PAGE_SCREENSHOT_LIMITS } = {}) {
  const view = metrics.cssVisualViewport || metrics.visualViewport || {};
  const content = metrics.cssContentSize || metrics.contentSize || {};
  const viewWidth = positive(view.clientWidth, 1280);
  const viewHeight = positive(view.clientHeight, 800);
  const clip = fullPage
    ? { x: 0, y: 0, width: positive(content.width, viewWidth), height: positive(content.height, viewHeight) }
    : { x: Math.max(0, Number(view.pageX) || 0), y: Math.max(0, Number(view.pageY) || 0), width: viewWidth, height: viewHeight };
  const maxHeight = fullPage ? limits.fullPageMaxHeight : limits.maxHeight;
  // A very tall page is cut at the height that still fits at full width.
  if (fullPage && clip.height * Math.min(1, limits.maxWidth / clip.width) > maxHeight) {
    clip.height = Math.ceil(maxHeight / Math.min(1, limits.maxWidth / clip.width));
  }
  clip.scale = Math.min(1, limits.maxWidth / clip.width, maxHeight / clip.height);
  return clip;
}

/**
 * Capture through `send(method, params)` on an attached page session.
 * Returns `{ data, width, height, crop }`; throws on timeout or CDP error.
 */
export async function capturePage(send, {
  fullPage = false, limits = PAGE_SCREENSHOT_LIMITS, timeouts = PAGE_SCREENSHOT_TIMEOUT_MS, log = () => {},
} = {}) {
  const metrics = await withTimeout(send('Page.getLayoutMetrics', {}), timeouts.metrics, 'Page.getLayoutMetrics');
  let clip = screenshotClip(metrics, { fullPage, limits });
  const maxHeight = fullPage ? limits.fullPageMaxHeight : limits.maxHeight;
  const shoot = async () => {
    const started = Date.now();
    const { data } = await withTimeout(send('Page.captureScreenshot', {
      format: 'jpeg', quality: limits.quality, clip, ...(fullPage ? { captureBeyondViewport: true } : {}),
    }), timeouts.capture, 'Page.captureScreenshot');
    if (typeof data !== 'string' || !data) throw new Error('Page.captureScreenshot 未返回图片');
    log(`Page.captureScreenshot done (${Date.now() - started} ms)`);
    return data;
  };
  let data = await shoot();
  let size = jpegSize(data);
  // A device pixel ratio above 1 makes the image larger than the clip; shrink once more.
  if (size && (size.width > limits.maxWidth + 1 || size.height > maxHeight + 1)) {
    const ratio = Math.min(limits.maxWidth / size.width, maxHeight / size.height);
    clip = { ...clip, scale: clip.scale * ratio };
    data = await shoot();
    size = jpegSize(data);
  }
  const width = size?.width ?? Math.round(clip.width * clip.scale);
  const height = size?.height ?? Math.round(clip.height * clip.scale);
  return { data, width, height, crop: { cropped: clip.scale < 1, croppedSize: Buffer.byteLength(data, 'base64') } };
}

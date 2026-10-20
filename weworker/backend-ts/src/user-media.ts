/**
 * Images and files that a tool shows to the user of the *current* conversation.
 *
 * The turn's caller owns delivery: the desktop chat shows them in the conversation,
 * a bot channel sends them to the chat the message came from. A turn without a
 * sink (or without file support) cannot deliver, and the tool reports that —
 * it never falls back to another channel or to whoever messaged a bot last.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { ContentBlock } from './works-store.js'

export interface UserMediaFile {
  path: string
  name: string
  size: number
  mime: string
}

export interface UserMediaImage extends UserMediaFile {
  /** Base64 of the file bytes. */
  data: string
}

export interface UserMediaSink {
  image?: (image: UserMediaImage) => void | Promise<void>
  file?: (file: UserMediaFile) => void | Promise<void>
}

export const MAX_USER_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_USER_FILE_BYTES = 100 * 1024 * 1024

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
}

function regularFile(resolved: string, limit: number): fs.Stats {
  const stat = fs.statSync(resolved)
  if (!stat.isFile()) throw new Error('不是文件')
  if (stat.size === 0) throw new Error('文件为空')
  if (stat.size > limit) throw new Error(`文件超过 ${Math.round(limit / 1024 / 1024)} MB`)
  return stat
}

export function describeUserFile(resolved: string): UserMediaFile {
  const stat = regularFile(resolved, MAX_USER_FILE_BYTES)
  const ext = path.extname(resolved).toLowerCase()
  return { path: resolved, name: path.basename(resolved), size: stat.size, mime: IMAGE_TYPES[ext] || 'application/octet-stream' }
}

export function readUserImage(resolved: string): UserMediaImage {
  const ext = path.extname(resolved).toLowerCase()
  const mime = IMAGE_TYPES[ext]
  if (!mime) throw new Error('只支持 PNG、JPG、GIF、WebP、BMP 图片')
  const stat = regularFile(resolved, MAX_USER_IMAGE_BYTES)
  return { path: resolved, name: path.basename(resolved), size: stat.size, mime, data: fs.readFileSync(resolved).toString('base64') }
}

let mediaCounter = 0
/** Block id for a delivered image; unique within the process. */
export function userMediaBlockId(): string {
  mediaCounter = (mediaCounter + 1) % 1e9
  return `user-image-${Date.now().toString(36)}-${mediaCounter}`
}

/** Image block as stored in a work: rendered by the desktop like a screenshot. */
export function userImageBlock(image: UserMediaImage, id = userMediaBlockId()): ContentBlock {
  return { type: 'tool_use', id, name: 'send_image_to_user', args: { name: image.name }, image: image.data, status: 'done' }
}

export function userFileBlock(file: UserMediaFile): ContentBlock {
  return { type: 'file_attachment', name: file.name, path: file.path, size: file.size, mime: file.mime }
}

/**
 * Desktop chat: images and files appear in the conversation itself.
 * `append` stores a block in the assistant message; `send` streams the event to the Renderer.
 */
export function createDesktopUserMedia(out: { append: (block: ContentBlock) => void; send: (event: object) => void }): UserMediaSink {
  return {
    image(image) {
      const id = userMediaBlockId()
      out.append(userImageBlock(image, id))
      out.send({ type: 'tool_call_image', id, data: image.data })
    },
    file(file) {
      const attachment = userFileBlock(file)
      out.append(attachment)
      out.send({ type: 'user_file', attachment })
    },
  }
}

/**
 * Bot channels: images join the turn's images, which the channel already sends to the
 * chat the message came from (and stores for the desktop view). `file` is set only by
 * channels that can send files to that chat.
 */
export function createChannelUserMedia(images: string[], blocks: ContentBlock[], file?: UserMediaSink['file']): UserMediaSink {
  return {
    image(image) {
      images.push(image.data)
      blocks.push(userImageBlock(image))
    },
    ...(file ? { file } : {}),
  }
}

export const NO_IMAGE_DELIVERY = '当前对话无法显示图片（这类对话没有可送达的出口），图片没有发送给任何人。请把图片路径告诉用户。'
export const NO_FILE_DELIVERY = '当前对话无法发送文件，文件没有发送给任何人。请把文件路径告诉用户。'

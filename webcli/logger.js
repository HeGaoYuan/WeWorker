/**
 * Dual Logger - 同时输出到 stderr 和文件
 *
 * 用于 MCP server 模式，确保日志既能被客户端捕获，又能独立保存
 */

import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const WEBCLI_DIR = join(homedir(), ".webcli");

export class DualLogger {
  constructor(prefix = "MCP") {
    this.prefix = prefix;
    this.fileStream = null;
    this.logFilePath = null;
  }

  /**
   * 初始化日志文件（带时间戳）
   */
  async init() {
    await mkdir(WEBCLI_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    this.logFilePath = join(WEBCLI_DIR, `mcp-${timestamp}.log`);

    this.fileStream = createWriteStream(this.logFilePath, { flags: "a" });

    this.log(`Log file created: ${this.logFilePath}`);
    this.log(`Started at: ${new Date().toISOString()}`);
  }

  /**
   * 写日志（同时输出到 stderr 和文件）
   */
  log(message) {
    const timestamp = new Date().toISOString();
    const prefixedMsg = `[${this.prefix}] ${message}`;
    const fileMsg = `${timestamp} ${prefixedMsg}\n`;

    // 输出到 stderr（供客户端捕获）
    process.stderr.write(prefixedMsg + "\n");

    // 输出到文件
    if (this.fileStream) {
      this.fileStream.write(fileMsg);
    }
  }

  /**
   * 关闭日志文件
   */
  close() {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }

  /**
   * 获取日志文件路径
   */
  getLogPath() {
    return this.logFilePath;
  }
}

/**
 * 创建全局日志实例
 */
export function createLogger(prefix = "MCP") {
  return new DualLogger(prefix);
}

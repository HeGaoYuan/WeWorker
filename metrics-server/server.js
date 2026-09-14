#!/usr/bin/env node
/**
 * Adapter 埋点服务端 —— 入口
 *
 * 接收 webcli 客户端的回调上报，集中存储与聚合查询。零运行时依赖
 * （Node ≥22 内置 node:sqlite + 原生 http）。
 *
 * 环境变量：
 *   METRICS_PORT    监听端口（默认 8787）
 *   METRICS_DB      SQLite 文件路径（默认 ./metrics.db）
 *   METRICS_TOKEN   Bearer 鉴权 token（强烈建议设置；为空则开放，仅限内网/测试）
 *
 * 接口：
 *   POST /v1/metrics/batch    上报
 *   GET  /v1/stats            查询
 *   GET  /v1/healthz          健康检查
 */

import http from "http";
import { openDb } from "./db.js";
import { handle } from "./handler.js";

const PORT = parseInt(process.env.METRICS_PORT || "8787", 10);
const DB_FILE = process.env.METRICS_DB || "metrics.db";
const TOKEN = process.env.METRICS_TOKEN || "";

const db = openDb(DB_FILE);
const ctx = { db, token: TOKEN };

const server = http.createServer((req, res) => {
  handle(req, res, ctx).catch((e) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "internal", message: e.message }));
  });
});

server.listen(PORT, () => {
  process.stderr.write(`[metrics-server] listening on :${PORT} (db=${DB_FILE}, auth=${TOKEN ? "on" : "OFF"})\n`);
  if (!TOKEN) process.stderr.write("[metrics-server] WARNING: METRICS_TOKEN 未设置，接口开放，仅限内网/测试\n");
});

const shutdown = () => { server.close(() => { try { db.close(); } catch {} process.exit(0); }); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

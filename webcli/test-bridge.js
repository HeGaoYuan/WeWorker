#!/usr/bin/env node
/**
 * 测试 WebSocket Bridge 是否正常工作
 * 运行: node webcli/test-bridge.js
 */

import { WebSocketBridge } from "./bridge.js";

console.log("Starting WebSocket Bridge test...");

const bridge = new WebSocketBridge();

console.log("Bridge started. Waiting for extension to connect...");
console.log("Open Chrome extension and check if it connects.");

setInterval(() => {
  console.log(`[${new Date().toISOString()}] Bridge alive, extension: ${bridge.isExtensionConnected() ? 'connected' : 'disconnected'}`);
}, 5000);

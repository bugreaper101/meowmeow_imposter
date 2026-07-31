import http from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { handleClose, handleMessage, sessionCount } from "./dispatcher.js";
import { roomCount, startCleanupLoop } from "./roomManager.js";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: roomCount(), sessions: sessionCount(), uptime: process.uptime() }));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("MeowMeow Imposter realtime server");
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });

wss.on("connection", (socket, req) => {
  const origin = req.headers.origin;
  if (!config.origins.includes("*") && origin && !config.origins.includes(origin)) {
    socket.close(1008, "origin not allowed");
    return;
  }
  socket.isAlive = true;
  socket.on("pong", () => {
    socket.isAlive = true;
  });
  socket.on("message", (data) => handleMessage(socket, data.toString()));
  socket.on("close", () => handleClose(socket));
  socket.on("error", () => handleClose(socket));
});

// Drop half-open sockets so their seats can free up.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 20_000);

const cleanup = startCleanupLoop();

server.listen(config.port, config.host, () => {
  logger.warn(`MeowMeow Imposter server listening on ws://${config.host}:${config.port}/ws`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearInterval(heartbeat);
    clearInterval(cleanup);
    wss.close();
    server.close(() => process.exit(0));
  });
}

process.on("uncaughtException", (error) => logger.error("uncaught", error));
process.on("unhandledRejection", (error) => logger.error("unhandled", error));
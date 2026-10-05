import type { Express, Request, Response } from "express";
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { ensureDevice, insertTelemetry } from "./db";

const esp32FrameSchema = z.object({
  timestamp: z.number().finite().optional(),
  timestampMs: z.number().finite().optional(),
  v_pv: z.number().finite(),
  i_pv: z.number().finite(),
  p_pv: z.number().finite().optional(),
  v_mp: z.number().finite().optional(),
  i_ph: z.number().finite().optional(),
  duty: z.number().min(0).max(1),
  efficiency: z.number().min(0).max(100).optional(),
  scenarioCode: z.string().max(16).optional(),
  firmware: z.string().max(32).optional(),
  temperature: z.number().finite().optional(),
});

export type Esp32Frame = z.infer<typeof esp32FrameSchema> & {
  timestampMs: number;
  source: "ESP32";
  p_pv: number;
  v_mp: number;
  i_ph: number;
};

const espClients = new Set<WebSocket>();
let latestEspFrame: Esp32Frame | null = null;
let lastSeenMs = 0;

export function broadcastEsp32Command(command: { cmd: string; [key: string]: any }) {
  const message = JSON.stringify(command);
  espClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.warn("[ESP32 WS] Broadcast error:", err);
      }
    }
  });
}

export const esp32Wss = new WebSocketServer({ noServer: true });

esp32Wss.on("connection", (socket, req) => {
  espClients.add(socket);
  lastSeenMs = Date.now();
  console.log(`[ESP32 WS] Node connected from ${req.socket.remoteAddress}`);

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "ack",
        server: "ESP32-MPPT-Server",
        timestamp: Date.now(),
        message: "ESP32 telemetry link established with SQLite persistent logger",
      })
    );
  }

  socket.on("message", async (data) => {
    try {
      const raw = JSON.parse(data.toString());
      const parsed = esp32FrameSchema.safeParse(raw);
      if (parsed.success) {
        const body = parsed.data;
        const timestampMs = Math.round(body.timestampMs ?? body.timestamp ?? Date.now());
        const p_pv = body.p_pv ?? body.v_pv * body.i_pv;
        const v_mp = body.v_mp ?? body.v_pv;
        const i_ph = body.i_ph ?? body.i_pv;

        const frame: Esp32Frame = {
          ...body,
          p_pv,
          v_mp,
          i_ph,
          timestampMs,
          source: "ESP32",
        };
        latestEspFrame = frame;
        lastSeenMs = Date.now();

        // Broadcast frame to all listening WebSocket clients
        broadcastEsp32Frame(frame);

        const device = await ensureDevice("array-a");
        await insertTelemetry({
          deviceId: device.id,
          timestampMs,
          vPv: body.v_pv,
          iPv: body.i_pv,
          pPv: p_pv,
          vMp: v_mp,
          iPh: i_ph,
          duty: body.duty,
          efficiency: body.efficiency ?? 96.8,
          source: "ESP32",
          scenarioCode: body.scenarioCode ?? "S5",
        });
      }
    } catch (err) {
      console.warn("[ESP32 WS] Frame parse error:", err);
    }
  });

  socket.on("close", () => {
    espClients.delete(socket);
    console.log("[ESP32 WS] Node disconnected");
  });

  socket.on("error", () => {
    espClients.delete(socket);
  });
});

export function broadcastEsp32Frame(frame: Esp32Frame) {
  const message = JSON.stringify(frame);
  espClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.warn("[ESP32 WS] Frame broadcast error:", err);
      }
    }
  });
}

export function registerEsp32Transport(app: Express, _server?: HttpServer) {
  app.get("/api/esp32/status", (_req, res) => {
    res.json({
      ok: true,
      connectedNodes: espClients.size,
      lastSeenMs,
      latest: latestEspFrame,
    });
  });

  app.get("/api/telemetry/esp32/latest", (_req, res) => {
    res.json({ ok: true, telemetry: latestEspFrame });
  });

  app.post("/api/telemetry/esp32", async (req: Request, res: Response) => {
    const isArray = Array.isArray(req.body);
    const rawItems = isArray ? req.body : [req.body];
    const savedFrames = [];

    const device = await ensureDevice("array-a");

    for (const item of rawItems) {
      const parsed = esp32FrameSchema.safeParse(item);
      if (parsed.success) {
        const body = parsed.data;
        const timestampMs = Math.round(body.timestampMs ?? body.timestamp ?? Date.now());
        const p_pv = body.p_pv ?? body.v_pv * body.i_pv;
        const v_mp = body.v_mp ?? body.v_pv;
        const i_ph = body.i_ph ?? body.i_pv;

        const frame: Esp32Frame = {
          ...body,
          p_pv,
          v_mp,
          i_ph,
          timestampMs,
          source: "ESP32",
        };
        latestEspFrame = frame;
        lastSeenMs = Date.now();

        broadcastEsp32Frame(frame);

        await insertTelemetry({
          deviceId: device.id,
          timestampMs,
          vPv: body.v_pv,
          iPv: body.i_pv,
          pPv: p_pv,
          vMp: v_mp,
          iPh: i_ph,
          duty: body.duty,
          efficiency: body.efficiency ?? 96.8,
          source: "ESP32",
          scenarioCode: body.scenarioCode ?? "S5",
        });
        savedFrames.push(frame);
      }
    }

    return res.json({
      ok: 1,
      savedCount: savedFrames.length,
      latest: latestEspFrame,
    });
  });
}

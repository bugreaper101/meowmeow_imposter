import mqtt, { type MqttClient } from "mqtt";

type Outgoing = Record<string, unknown> & { t: string };
type MessageHandler = (msg: Outgoing) => void;

const BROKERS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
];

let client: MqttClient | null = null;
let connected = false;
let activeBroker = 0;
let inboxTopic = "";
let privateTopic = "";
let outTopic = "";
let handler: MessageHandler | null = null;

export function inboxPath(code: string) {
  return `mmi/v1/${code.trim().toUpperCase()}/in`;
}

export function privatePath(code: string, clientId: string) {
  return `mmi/v1/${code.trim().toUpperCase()}/p/${clientId}`;
}

export function outPath(code: string) {
  return `mmi/v1/${code.trim().toUpperCase()}/out`;
}

export function isRelayReady() {
  return Boolean(client && connected);
}

function parsePayload(payload: Buffer | string): Outgoing | null {
  try {
    const text = typeof payload === "string" ? payload : payload.toString("utf8");
    const msg = JSON.parse(text) as Outgoing;
    if (!msg || typeof msg.t !== "string") return null;
    return msg;
  } catch {
    return null;
  }
}

function attachClient(next: MqttClient) {
  client = next;
  next.on("connect", () => {
    connected = true;
    if (inboxTopic) next.subscribe(inboxTopic, { qos: 1 });
    if (privateTopic) next.subscribe(privateTopic, { qos: 1 });
    if (outTopic) next.subscribe(outTopic, { qos: 1 });
  });
  next.on("reconnect", () => {
    connected = false;
  });
  next.on("close", () => {
    connected = false;
  });
  next.on("message", (_topic, payload) => {
    const msg = parsePayload(payload);
    if (msg) handler?.(msg);
  });
}

function connectBroker(url: string, clientId: string) {
  return new Promise<MqttClient>((resolve, reject) => {
    const next = mqtt.connect(url, {
      clientId,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 2500,
      connectTimeout: 8000,
      protocolVersion: 4,
    });
    const fail = (error?: Error) => {
      try {
        next.end(true);
      } catch {
        // ignore
      }
      reject(error || new Error("mqtt failed"));
    };
    const timer = setTimeout(() => fail(new Error("mqtt timeout")), 9000);
    next.once("connect", () => {
      clearTimeout(timer);
      resolve(next);
    });
    next.once("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
  });
}

export async function connectRelay(opts: {
  clientId: string;
  code: string;
  role: "host" | "guest";
  onMessage: MessageHandler;
}): Promise<void> {
  handler = opts.onMessage;
  inboxTopic = opts.role === "host" ? inboxPath(opts.code) : "";
  privateTopic = opts.role === "guest" ? privatePath(opts.code, opts.clientId) : "";
  outTopic = opts.role === "guest" ? outPath(opts.code) : "";

  if (client && connected) {
    if (inboxTopic) client.subscribe(inboxTopic, { qos: 1 });
    if (privateTopic) client.subscribe(privateTopic, { qos: 1 });
    if (outTopic) client.subscribe(outTopic, { qos: 1 });
    return;
  }

  if (client) {
    try {
      client.end(true);
    } catch {
      // ignore
    }
    client = null;
    connected = false;
  }

  const mqttId = `mmi${opts.clientId.replace(/[^a-zA-Z0-9]/g, "").slice(-18)}${Math.floor(Math.random() * 99)}`;
  let lastError: Error | null = null;
  for (let i = 0; i < BROKERS.length; i += 1) {
    const url = BROKERS[(activeBroker + i) % BROKERS.length]!;
    try {
      const next = await connectBroker(url, mqttId);
      activeBroker = (activeBroker + i) % BROKERS.length;
      attachClient(next);
      connected = true;
      if (inboxTopic) next.subscribe(inboxTopic, { qos: 1 });
      if (privateTopic) next.subscribe(privateTopic, { qos: 1 });
      if (outTopic) next.subscribe(outTopic, { qos: 1 });
      return;
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError || new Error("Could not reach the kitty relay.");
}

export function relayPublish(topic: string, payload: unknown, retain = false) {
  if (!client || !connected) return false;
  try {
    client.publish(topic, JSON.stringify(payload), { qos: 1, retain });
    return true;
  } catch {
    return false;
  }
}

export function disconnectRelay() {
  handler = null;
  inboxTopic = "";
  privateTopic = "";
  outTopic = "";
  connected = false;
  if (!client) return;
  try {
    client.end(true);
  } catch {
    // ignore
  }
  client = null;
}

import { keepalive } from '../socket/keepalive.js';

export type RateWindow = { windowStart: number; count: number };

type Limits = { messages: number; windowMs: number };

const policyViolation = 1008;
const status = { forbidden: 403, upgradeRequired: 426, switchingProtocols: 101 };
const header = { upgrade: 'Upgrade', origin: 'Origin' };
const websocketUpgrade = 'websocket';

export class SocketRoom<Out> {
  constructor(
    private ctx: DurableObjectState,
    private limits: Limits,
  ) {
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(keepalive.request, keepalive.response));
  }

  accept(tag: string, attachment: RateWindow): { server: WebSocket; response: Response } {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [tag]);
    server.serializeAttachment(attachment);
    return { server, response: upgraded(client) };
  }

  reject(message: Out, reason: string): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    this.close(server, message, reason);
    return upgraded(client);
  }

  close(ws: WebSocket, message: Out, reason: string): void {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.send(ws, message);
    ws.close(policyViolation, reason);
  }

  send(ws: WebSocket, message: Out): void {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    ws.send(JSON.stringify(message));
  }

  broadcast(message: Out): void {
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, message);
    }
  }

  isOnline(tag: string): boolean {
    return this.ctx.getWebSockets(tag).some((ws) => ws.readyState === WebSocket.OPEN);
  }

  isRateLimited(ws: WebSocket, attachment: RateWindow): boolean {
    const now = Date.now();
    if (now - attachment.windowStart > this.limits.windowMs) {
      attachment.windowStart = now;
      attachment.count = 0;
    }

    attachment.count++;
    ws.serializeAttachment(attachment);
    return attachment.count > this.limits.messages;
  }
}

export function upgradeError(request: Request): Response | null {
  if (request.headers.get(header.upgrade) !== websocketUpgrade) {
    return new Response(null, { status: status.upgradeRequired });
  }

  const origin = request.headers.get(header.origin);
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return new Response(null, { status: status.forbidden });
  }

  return null;
}

function upgraded(client: WebSocket): Response {
  return new Response(null, { status: status.switchingProtocols, webSocket: client });
}

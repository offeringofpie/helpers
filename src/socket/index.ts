import { keepalive } from './keepalive.js';

export type SocketStatus = 'connecting' | 'open' | 'closed';

type Handlers<In> = {
  isMessage: (data: unknown) => data is In;
  onMessage: (message: In) => void;
  onStatus: (status: SocketStatus) => void;
};

const keepaliveMs = 20_000;
const staleMs = 45_000;
const firstRetryMs = 500;
const maxRetryMs = 10_000;
const scheme = { https: 'https:', ws: 'ws:', wss: 'wss:' };

export class ReconnectingSocket<In, Out> {
  private ws: WebSocket | null = null;
  private retryMs = firstRetryMs;
  private keepaliveTimer = 0;
  private lastSeen = 0;
  private stopped = false;

  constructor(
    private url: () => string,
    private handlers: Handlers<In>,
  ) {
    this.open();
  }

  send(message: Out): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  close(): void {
    this.stopped = true;
    this.ws?.close();
  }

  private open(): void {
    const ws = new WebSocket(this.url());
    this.ws = ws;
    this.handlers.onStatus('connecting');

    ws.onopen = () => {
      this.retryMs = firstRetryMs;
      this.lastSeen = Date.now();
      this.handlers.onStatus('open');
      this.keepaliveTimer = window.setInterval(() => this.checkAlive(ws), keepaliveMs);
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      this.lastSeen = Date.now();
      if (event.data === keepalive.response) {
        return;
      }

      const data: unknown = JSON.parse(event.data);
      if (!this.handlers.isMessage(data)) {
        return;
      }

      this.handlers.onMessage(data);
    };

    ws.onclose = () => {
      this.reconnect();
    };
  }

  private checkAlive(ws: WebSocket): void {
    if (Date.now() - this.lastSeen < staleMs) {
      ws.send(keepalive.request);
      return;
    }

    ws.onclose = null;
    ws.close();
    this.reconnect();
  }

  private reconnect(): void {
    window.clearInterval(this.keepaliveTimer);
    this.handlers.onStatus('closed');
    if (this.stopped) {
      return;
    }

    window.setTimeout(() => this.open(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, maxRetryMs);
  }
}

export function socketUrl(path: string): string {
  const protocol = location.protocol === scheme.https ? scheme.wss : scheme.ws;
  return `${protocol}//${location.host}${path}`;
}

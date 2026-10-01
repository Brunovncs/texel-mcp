type Params = Record<string, unknown>;
type Handler = (params: Params) => void;

interface RpcMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: Params;
  result?: unknown;
  error?: { code: number; message: string };
}

/** JSON-RPC 2.0 over postMessage between an MCP App view and its host (SEP-1865). */
export class HostBridge {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private handlers = new Map<string, Handler[]>();

  constructor(private target: Window = window.parent) {
    window.addEventListener('message', (event) => {
      if (event.source !== this.target) return;
      const msg = event.data as RpcMessage;
      if (!msg || msg.jsonrpc !== '2.0') return;
      if (msg.id !== undefined && !msg.method) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method) for (const h of this.handlers.get(msg.method) ?? []) h(msg.params ?? {});
    });
  }

  get embedded(): boolean {
    return this.target !== window;
  }

  request<T = unknown>(method: string, params: Params = {}, timeoutMs = 15000): Promise<T> {
    const id = this.nextId++;
    this.target.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  notify(method: string, params: Params = {}) {
    this.target.postMessage({ jsonrpc: '2.0', method, params }, '*');
  }

  on(method: string, handler: Handler) {
    this.handlers.set(method, [...(this.handlers.get(method) ?? []), handler]);
  }
}

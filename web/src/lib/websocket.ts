type EventHandler = (data: any) => void;

export function createWSClient(url: string) {
  const wsUrl = url.replace(/^https?:/, url.startsWith('https') ? 'wss:' : 'ws:');
  const handlers = new Map<string, Set<EventHandler>>();
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function connect() {
    if (disposed) return;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const handlersForEvent = handlers.get(msg.event);
        if (handlersForEvent) {
          for (const handler of handlersForEvent) {
            handler(msg.data);
          }
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!disposed) {
        reconnectTimer = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();

  return {
    on(event: string, handler: EventHandler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: EventHandler) {
      handlers.get(event)?.delete(handler);
    },
    send(event: string, data: any) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event, data }));
      }
    },
    close() {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}

import { FastifyInstance } from 'fastify';

const sessionConnections = new Map<string, Set<any>>();

export async function wsRoutes(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      socket.close(4001, 'sessionId required');
      return;
    }

    if (!sessionConnections.has(sessionId)) {
      sessionConnections.set(sessionId, new Set());
    }
    sessionConnections.get(sessionId)!.add(socket);

    socket.on('close', () => {
      const conns = sessionConnections.get(sessionId);
      if (conns) {
        conns.delete(socket);
        if (conns.size === 0) sessionConnections.delete(sessionId);
      }
    });

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'recording:frame' && msg.data) {
          broadcastToSession(sessionId, 'observation:processing', {
            sessionId,
            timestamp: msg.data.timestamp,
          });
        }
      } catch {
        // ignore malformed messages
      }
    });
  });
}

export function broadcastToSession(sessionId: string, event: string, data: any) {
  const conns = sessionConnections.get(sessionId);
  if (!conns) return;

  const message = JSON.stringify({ event, data });
  for (const socket of conns) {
    try {
      socket.send(message);
    } catch {
      conns.delete(socket);
    }
  }
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface TelemetryMessage {
  wellId: string;
  t: number;
  sourceT: number;
  values: Record<string, number>;
  quality: Record<string, 'good' | 'suspect' | 'missing'>;
  rigState: string;
  onBottom: boolean | null;
  bitSpeedFtMin: number | null;
  replay: { file: string; row: number; total: number; speed: number };
}

export type ConnState = 'connecting' | 'connected' | 'error';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = new URL(API).origin;

const MAX_POINTS = 120;
const RENDER_EVERY_MS = 400; // data can arrive at 100x speed; never re-render per message

/**
 * Subscribes to live telemetry for a room. Keeps a ring buffer in a ref and publishes it to React
 * on a timer, so a fast feed cannot flood the renderer.
 */
export function useTelemetry(room: string) {
  const [conn, setConn] = useState<ConnState>('connecting');
  const [error, setError] = useState('');
  const [points, setPoints] = useState<TelemetryMessage[]>([]);
  const [lastAt, setLastAt] = useState(0);
  const buffer = useRef<TelemetryMessage[]>([]);
  const dirty = useRef(false);
  const lastMsgAt = useRef(0);

  const clear = useCallback(() => {
    buffer.current = [];
    dirty.current = true;
  }, []);

  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;
    let refresh: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      try {
        // Short-lived socket token, because the session cookie is httpOnly and unreadable here.
        const res = await fetch('/api/backend/auth/socket-token', { method: 'POST', cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !data.token) throw new Error(data.message || 'Could not get a socket token');
        if (cancelled) return;

        socket = io(SOCKET_URL, { auth: { token: data.token }, reconnection: false });
        socket.on('connect', () => {
          socket!.emit('join-well', room, (r: { ok: boolean; error?: string }) => {
            if (r?.ok) { setConn('connected'); setError(''); }
            else { setConn('error'); setError(r?.error || 'Could not join the room'); }
          });
        });
        socket.on('connect_error', (e) => { setConn('error'); setError(e.message); });
        socket.on('disconnect', () => setConn('connecting'));
        const accept = (m: TelemetryMessage) => {
          if (m.wellId !== room) return;
          lastMsgAt.current = Date.now();
          buffer.current.push(m);
          if (buffer.current.length > MAX_POINTS) buffer.current.splice(0, buffer.current.length - MAX_POINTS);
          dirty.current = true;
        };
        socket.on('telemetry', accept); // replay / single points
        socket.on('telemetry-batch', (batch: TelemetryMessage[]) => { if (Array.isArray(batch)) batch.forEach(accept); }); // live feeds

        // The token lives 5 minutes; reconnect with a fresh one just before it expires.
        refresh = setTimeout(() => {
          socket?.disconnect();
          if (!cancelled) connect();
        }, 4.5 * 60 * 1000);
      } catch (e) {
        if (!cancelled) { setConn('error'); setError((e as Error).message); }
      }
    }

    connect();
    const timer = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setPoints([...buffer.current]);
      setLastAt(lastMsgAt.current);
    }, RENDER_EVERY_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (refresh) clearTimeout(refresh);
      socket?.emit('leave-well', room);
      socket?.disconnect();
    };
  }, [room]);

  return { conn, error, points, lastAt, clear };
}

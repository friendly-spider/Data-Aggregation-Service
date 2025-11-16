import { describe, it, expect, vi } from 'vitest';

class FakeWS {
  readyState = 1; // OPEN
  private handlers: Record<string, Function[]> = {};
  on(event: string, fn: Function) { (this.handlers[event] ||= []).push(fn); }
  emit(event: string, ...args: any[]) { (this.handlers[event]||[]).forEach(f => f(...args)); }
  send(_msg: string) {}
}

class FakeWSS {
  clients = new Set<FakeWS>();
  private handlers: Record<string, Function[]> = {};
  on(event: string, fn: Function) { (this.handlers[event] ||= []).push(fn); }
  emit(event: string, ...args: any[]) { (this.handlers[event]||[]).forEach(f => f(...args)); }
}

const duplicate = () => ({
  subscribe: (_ch: string, _cb: any) => {},
  on: (_: string, __: any) => {},
});
vi.mock('../src/services/cache', () => ({
  redis: { duplicate },
}));

import { setupWsPubSub, getActiveQueries } from '../src/services/ws-broadcaster';

describe('ws-broadcaster filters', () => {
  it('tracks active queries from connections and setFilter messages', () => {
    const wss: any = new FakeWSS();
    const fakeRedis: any = { duplicate };

    setupWsPubSub(wss, fakeRedis);

    const ws1: any = new FakeWS();
    wss.clients.add(ws1);

    // Simulate connection with no query
    wss.emit('connection', ws1, { url: '/ws' } as any);
    expect(Array.from(getActiveQueries()).length).toBe(0);

    // Send setFilter with q
    ws1.emit('message', Buffer.from(JSON.stringify({ type: 'setFilter', q: 'sol' })));
    const actives = Array.from(getActiveQueries());
    expect(actives).toContain('sol');
  });
});

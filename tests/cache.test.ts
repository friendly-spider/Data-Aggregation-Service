import { describe, it, expect, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setSpy: vi.fn(async (..._args: any[]) => {}),
  getSpy: vi.fn(async (_k: string) => null),
}));

vi.mock('../src/services/cache', async () => {
  const mod = await vi.importActual<any>('../src/services/cache');
  return {
    ...mod,
    redis: { set: hoisted.setSpy, get: hoisted.getSpy },
    getCached: async (k: string) => {
      const raw = await hoisted.getSpy(k);
      return raw ? JSON.parse(raw) : null;
    },
    setCached: async (k: string, v: any, ttl = 30) => {
      if (ttl > 0) await hoisted.setSpy(k, JSON.stringify(v), 'EX', ttl);
    },
  };
});

import { getCached, setCached } from '../src/services/cache';

describe('cache helpers', () => {
  it('skips set when ttl<=0', async () => {
    await setCached('k', { a: 1 }, 0);
    expect(hoisted.setSpy).not.toHaveBeenCalled();
  });

  it('calls redis.set when ttl>0 and getCached parses JSON', async () => {
    await setCached('k', { a: 2 }, 30);
    expect(hoisted.setSpy).toHaveBeenCalled();
  });
});

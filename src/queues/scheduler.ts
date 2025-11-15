import { refreshQueue } from './refreshQueue';

export async function scheduleRefresh(query: string) {
  await refreshQueue.add(
    'refresh',
    { query },
    {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true
    }
  );
}

import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { fetchAndMerge } from '../services/aggregator';

// REQUIRED: BullMQ + ioredis config
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const refreshQueue = new Queue('refreshQueue', {
  connection,
});

export function startWorker() {
  const worker = new Worker(
    'refreshQueue',
    async (job: Job<{ query: string }>) => {
      const { query } = job.data;

      const result = await fetchAndMerge(query, 0);

      await connection.publish(
        'tokens:updates',
        JSON.stringify({
          type: 'snapshot',
          query,
          data: result.items,
        })
      );

      return { ok: true };
    },
    {
      connection,
      // Optional concurrency control
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`✔ Job completed: ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job failed: ${job?.id}`, err);
  });

  return worker;
}

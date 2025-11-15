import got from 'got';

export const http = got.extend({
  responseType: 'json',
  timeout: 15000,
  retry: {
    limit: 4,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
    errorCodes: ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'],
    calculateDelay: ({ attemptCount }) => {
      const base = Math.min(60_000, 200 * 2 ** attemptCount);
      const jitter = Math.floor(Math.random() * 1000);
      return base + jitter;
    }
  }
});

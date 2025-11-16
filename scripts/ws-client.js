// Simple WS test client: connects, sets filters, logs all messages
const WebSocket = require('ws');

const host = process.env.WS_URL || 'ws://localhost:3000/ws';
const q = process.env.Q || 'sol';
const period = process.env.PERIOD || '24h';

console.log('Connecting to', host, 'with filters', { q, period });
const ws = new WebSocket(host);

ws.on('open', () => {
  console.log('WS open');
  try { ws.send(JSON.stringify({ type: 'setFilter', q, period })); } catch {}
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(String(data));
    console.log('WS message:', msg.type, msg.query || '', msg.data ? (Array.isArray(msg.data) ? `items=${msg.data.length}` : Object.keys(msg.data).join(',')) : '');
  } catch (e) {
    console.log('WS raw:', String(data));
  }
});

ws.on('close', () => console.log('WS closed'));
ws.on('error', (e) => console.error('WS error', e.message));

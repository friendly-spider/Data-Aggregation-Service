(() => {
  const qs = (sel) => document.querySelector(sel);
  const qEl = qs('#q');
  const periodEl = qs('#period');
  const sortEl = qs('#sort');
  const orderEl = qs('#order');
  const limitEl = qs('#limit');
  const loadBtn = qs('#loadBtn');
  const moreBtn = qs('#moreBtn');
  const statusEl = qs('#status');
  const tbody = qs('#rows');

  let nextCursor = undefined;
  let ws;
  const rows = new Map(); // key -> tr
  const allTokens = new Map(); // key -> full token object
  const liveState = new Map(); // key -> { basePrice: number, lastPrice: number, livePct: number }

  function tokenKey(t){ return `${t.chain}:${t.token_address}`.toLowerCase(); }
  function shortAddr(a){ return a ? a.slice(0,4)+"…"+a.slice(-4) : ''; }
  function fmt(n, d=2){ if(n == null) return ''; const v = Number(n); if(!isFinite(v)) return ''; return v.toLocaleString(undefined,{ maximumFractionDigits:d }); }

  function buildUrl(cursor){
    const q = encodeURIComponent(qEl.value || 'sol');
    const period = encodeURIComponent(periodEl.value);
    const sort = encodeURIComponent(sortEl.value);
    const order = encodeURIComponent(orderEl.value);
    const limit = encodeURIComponent(limitEl.value || 20);
    let u = `/api/tokens?q=${q}&period=${period}&sort=${sort}&order=${order}&limit=${limit}`;
    if(cursor) u += `&cursor=${encodeURIComponent(cursor)}`;
    return u;
  }

  async function load(reset=true){
    if(reset){ tbody.innerHTML=''; rows.clear(); allTokens.clear(); nextCursor = undefined; }
    status(`Loading…`);
    const url = buildUrl(reset ? undefined : nextCursor);
    const res = await fetch(url);
    const data = await res.json();
    ingest(data.items || []);
    renderCurrentView();
    nextCursor = data.nextCursor;
    moreBtn.disabled = !nextCursor;
    status(`Loaded ${data.items?.length||0}${nextCursor?' (more available)':''}`);
  }

  function ingest(items){
    for(const t of items){
      const key = tokenKey(t);
      const prev = allTokens.get(key) || {};
      allTokens.set(key, { ...prev, ...t });
    }
  }

  function getSortValue(t){
    const period = periodEl.value;
    const sort = sortEl.value;
    if(sort === 'volume'){
      return period === '1h' ? (t.volume_1h ?? 0) : period === '7d' ? (t.volume_7d ?? 0) : ((t.volume_24h ?? t.volume_sol) ?? 0);
    } else if(sort === 'price_change'){
      return period === '1h' ? (t.price_1hr_change ?? 0) : period === '7d' ? (t.price_7d_change ?? 0) : (t.price_24h_change ?? 0);
    } else if(sort === 'market_cap'){
      return t.market_cap_usd ?? 0;
    } else if(sort === 'liquidity'){
      return t.liquidity_usd ?? 0;
    } else if(sort === 'tx_count'){
      return t.transaction_count ?? 0;
    } else if(sort === 'updated_at'){
      return t.updated_at ? Date.parse(t.updated_at) : 0;
    }
    return 0;
  }

  function passesFilter(t){
    const q = (qEl.value || '').trim().toLowerCase();
    if(!q) return true;
    return (
      (t.token_name && t.token_name.toLowerCase().includes(q)) ||
      (t.token_ticker && t.token_ticker.toLowerCase().includes(q)) ||
      (t.chain && t.chain.toLowerCase().includes(q)) ||
      (t.token_address && String(t.token_address).toLowerCase().includes(q))
    );
  }

  function renderCurrentView(){
    // Clear table
    tbody.innerHTML = '';
    rows.clear();
    const items = Array.from(allTokens.values()).filter(passesFilter);
    items.sort((a,b)=>{
      const av = Number(getSortValue(a)), bv = Number(getSortValue(b));
      if(orderEl.value === 'asc') return av - bv;
      return bv - av;
    });
    const limit = Math.max(1, Math.min(100, Number(limitEl.value||20)));
    const page = items.slice(0, limit);
    for(const t of page){ upsertRow(t); }
  }

  function upsertRow(t){
    const key = tokenKey(t);
    let tr = rows.get(key);
    const vol24 = t.volume_24h ?? t.volume_sol;
    const liqUSD = t.liquidity_usd;
    const mcUSD = t.market_cap_usd;
    const priceDelta = (periodEl.value === '1h' ? t.price_1hr_change : periodEl.value === '24h' ? t.price_24h_change : t.price_7d_change);
    // Update live state baseline/percent
    if (t.price_sol != null) {
      const st = liveState.get(key) || { basePrice: undefined, lastPrice: undefined, livePct: undefined };
      if (st.basePrice == null || st.basePrice === 0) st.basePrice = Number(t.price_sol) || 0;
      st.lastPrice = Number(t.price_sol) || st.lastPrice;
      if (st.basePrice && st.lastPrice != null) {
        st.livePct = ((st.lastPrice - st.basePrice) / Math.abs(st.basePrice)) * 100;
      }
      liveState.set(key, st);
    }
    if(!tr){
      tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="name"></td>
        <td class="ticker small"></td>
        <td class="chain small"></td>
        <td class="address"></td>
        <td class="price"></td>
        <td class="vol24"></td>
        <td class="liq"></td>
        <td class="mc"></td>
        <td class="tx"></td>
        <td class="delta"></td>
        <td class="live"></td>`;
      rows.set(key, tr);
      tbody.appendChild(tr);
    }
    tr.querySelector('.name').textContent = t.token_name || '';
    tr.querySelector('.ticker').textContent = t.token_ticker || '';
    tr.querySelector('.chain').textContent = t.chain || '';
    tr.querySelector('.address').textContent = shortAddr(t.token_address);
    tr.querySelector('.price').textContent = fmt(t.price_sol, 8);
    tr.querySelector('.vol24').textContent = fmt(vol24);
    tr.querySelector('.liq').textContent = fmt(liqUSD);
    tr.querySelector('.mc').textContent = fmt(mcUSD);
    tr.querySelector('.tx').textContent = fmt(t.transaction_count,0);
    tr.querySelector('.delta').textContent = priceDelta!=null ? fmt(priceDelta,2)+'%' : '';
    const st = liveState.get(key);
    const liveEl = tr.querySelector('.live');
    if (st && typeof st.livePct === 'number' && isFinite(st.livePct)) {
      liveEl.textContent = `${fmt(st.livePct,2)}%`;
      liveEl.style.color = st.livePct > 0 ? '#0a0' : (st.livePct < 0 ? '#c00' : '');
    } else {
      liveEl.textContent = '';
      liveEl.style.color = '';
    }
    tr.classList.add('highlight');
    setTimeout(()=>tr.classList.remove('highlight'), 600);
  }

  function status(msg){ statusEl.textContent = msg; }

  function connectWS(){
    if(ws){ try{ ws.close(); }catch{} }
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    ws = new WebSocket(url);
    ws.addEventListener('open', ()=>{
      status('WS connected');
      try{
        ws.send(JSON.stringify({ type:'setFilter', q: qEl.value || '', period: periodEl.value }));
      }catch{}
    });
    ws.addEventListener('close', ()=>status('WS disconnected'));
    ws.addEventListener('message', (ev)=>{
      try{
        const payload = JSON.parse(ev.data);
        status(`WS @ ${new Date().toLocaleTimeString()}`);
        if(payload?.type === 'snapshot'){
          if(Array.isArray(payload.data)){
            // Compact snapshot form
            const toIngest = payload.data.map((s)=>({ chain:s.chain, token_address:s.address, price_sol:s.price_sol, volume_24h:s.volume_sol, updated_at:s.updated_at }));
            ingest(toIngest);
            renderCurrentView();
          }
        } else if(payload?.type === 'delta'){
          const s = payload.data;
          const key = tokenKey({ chain:s.chain, token_address:s.address });
          const prev = allTokens.get(key) || { chain:s.chain, token_address:s.address };
          const next = { ...prev, price_sol:s.price_sol, volume_24h:s.volume_sol, updated_at:s.updated_at };
          allTokens.set(key, next);
          // If currently displayed, update row; otherwise ignore until next re-render
          if(rows.has(key)) upsertRow(next);
        }
      }catch{}
    });
  }

  loadBtn.addEventListener('click', async ()=>{ await load(true); connectWS(); });
  moreBtn.addEventListener('click', async ()=>{ if(nextCursor) await load(false); });
  // Local filtering & sort without new HTTP calls
  qEl.addEventListener('input', ()=>{
    renderCurrentView();
    try{ ws && ws.send(JSON.stringify({ type:'setFilter', q: qEl.value || '' })); }catch{}
  });
  periodEl.addEventListener('change', ()=>{
    renderCurrentView();
    try{ ws && ws.send(JSON.stringify({ type:'setFilter', period: periodEl.value })); }catch{}
  });
  sortEl.addEventListener('change', renderCurrentView);
  orderEl.addEventListener('change', renderCurrentView);
  limitEl.addEventListener('change', renderCurrentView);

  // initial
  load(true).then(()=>connectWS());
})();

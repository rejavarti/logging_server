#!/usr/bin/env node
/**
 * Stress test consolidated security endpoints (rate-limits + audit trail)
 * Runs multiple iterations of key endpoints and reports latency statistics.
 */
const baseUrl = process.env.STRESS_BASE_URL || 'http://localhost:10180';
const username = process.env.STRESS_USER || 'admin';
const password = process.env.STRESS_PASS || 'ChangeMe123!';
const iterations = parseInt(process.env.STRESS_ITERATIONS || '40');
const concurrency = parseInt(process.env.STRESS_CONCURRENCY || '8');

async function login() {
  const res = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error('Login failed HTTP ' + res.status);
  const json = await res.json();
  if (!json.token) throw new Error('Login token missing');
  return json.token;
}

function stats(values) {
  values.sort((a,b)=>a-b);
  const sum = values.reduce((s,v)=>s+v,0);
  return {
    count: values.length,
    min: values[0] || 0,
    p50: values[Math.floor(values.length*0.5)] || 0,
    p90: values[Math.floor(values.length*0.9)] || 0,
    p99: values[Math.floor(values.length*0.99)] || values[values.length-1] || 0,
    max: values[values.length-1] || 0,
    avg: values.length ? +(sum/values.length).toFixed(2) : 0
  };
}

async function timed(name, fn, results) {
  const start = performance.now();
  try {
    const r = await fn();
    const ms = performance.now() - start;
    results[name].push(ms);
    return r;
  } catch (err) {
    const ms = performance.now() - start;
    results[name].push(ms);
    throw err;
  }
}

async function run() {
  const token = await login();
  const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  const endpointGroups = {
    rateLimitsConfig: () => fetch(baseUrl + '/api/rate-limits/config', { headers }),
    rateLimitsStats: () => fetch(baseUrl + '/api/rate-limits/stats', { headers }),
    auditStats: () => fetch(baseUrl + '/api/audit-trail/stats', { headers }),
    auditSearch: () => fetch(baseUrl + '/api/audit-trail/search', { method:'POST', headers, body: JSON.stringify({ query:'login', limit:20 }) }),
    auditCompliance: () => fetch(baseUrl + '/api/audit-trail/compliance?standard=general', { headers }),
    auditSecurityEvents: () => fetch(baseUrl + '/api/audit-trail/security-events', { headers }),
    rateLimitsBlockUnblock: async () => {
      const ip = '10.0.0.' + Math.floor(Math.random()*200+1);
      const blockStart = performance.now();
      const block = await fetch(baseUrl + '/api/rate-limits/block', { method:'POST', headers, body: JSON.stringify({ ip, reason:'stress', duration:60 }) });
      const blockElapsed = performance.now() - blockStart;
      if (!block.ok) throw new Error('Block failed (' + block.status + ')');
      await block.arrayBuffer();
      // Minimal delay; will retry delete if first attempt fails due to race
      await new Promise(r=>setTimeout(r, 5));
      const delStart = performance.now();
      let unblockRes = await fetch(baseUrl + '/api/rate-limits/' + ip, { method:'DELETE', headers });
      let delElapsed = performance.now() - delStart;
      if (!unblockRes.ok) {
        // Retry once after brief backoff if first attempt failed
        await new Promise(r=>setTimeout(r, 25));
        const retryStart = performance.now();
        unblockRes = await fetch(baseUrl + '/api/rate-limits/' + ip, { method:'DELETE', headers });
        delElapsed = performance.now() - retryStart;
        if (!unblockRes.ok) throw new Error('Unblock failed after retry (' + unblockRes.status + ')');
      }
      return { ip, blockMs: +blockElapsed.toFixed(2), unblockMs: +delElapsed.toFixed(2) };
    },
    rateLimitsMetrics: () => fetch(baseUrl + '/api/rate-limits/metrics', { headers }),
    auditExport: () => fetch(baseUrl + '/api/audit-trail/export?format=json', { headers })
  };
  const resultTimes = Object.fromEntries(Object.keys(endpointGroups).map(k => [k, []]));
  let errors = [];

  const tasks = Array.from({ length: iterations }, (_, i) => i);
  async function worker() {
    while (tasks.length) {
      const i = tasks.pop();
      for (const [name, fn] of Object.entries(endpointGroups)) {
        try {
          const res = await timed(name, fn, resultTimes);
          // For simple fetches res is Response, for block/unblock it is a result object
          if (res instanceof Response) {
            if (!res.ok) throw new Error(name + ' HTTP ' + res.status);
            await res.arrayBuffer();
          }
        } catch (err) {
          errors.push({ iteration: i, endpoint: name, error: err.message });
        }
      }
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const summary = Object.fromEntries(Object.entries(resultTimes).map(([k,v]) => [k, stats(v)]));
  const report = { success: errors.length === 0, errors, iterations, concurrency, baseUrl, summary, generatedAt: new Date().toISOString() };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 2;
}

run().catch(e => { console.error(JSON.stringify({ success:false, error:e.message }, null, 2)); process.exit(1); });
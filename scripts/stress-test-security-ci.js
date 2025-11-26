#!/usr/bin/env node
/**
 * CI-Friendly Security & Audit Endpoint Smoke/Latency Test
 * Reduced iteration count for fast pipeline validation while still touching
 * all consolidated endpoints. Exits non-zero on any error.
 */
const baseUrl = process.env.CI_BASE_URL || 'http://localhost:10180';
const username = process.env.CI_USER || 'admin';
const password = process.env.CI_PASS || 'ChangeMe123!';
const iterations = parseInt(process.env.CI_ITERATIONS || '10');
const concurrency = parseInt(process.env.CI_CONCURRENCY || '4');

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
  if (!values.length) return { count:0,min:0,p50:0,p90:0,p99:0,max:0,avg:0 };
  values.sort((a,b)=>a-b);
  const sum = values.reduce((s,v)=>s+v,0);
  return {
    count: values.length,
    min: +values[0].toFixed(2),
    p50: +values[Math.floor(values.length*0.5)].toFixed(2),
    p90: +values[Math.floor(values.length*0.9)].toFixed(2),
    p99: +values[Math.min(values.length-1, Math.floor(values.length*0.99))].toFixed(2),
    max: +values[values.length-1].toFixed(2),
    avg: +(sum/values.length).toFixed(2)
  };
}

async function timed(name, fn, store) {
  const start = performance.now();
  try {
    const r = await fn();
    store[name].push(performance.now() - start);
    return r;
  } catch (e) {
    store[name].push(performance.now() - start);
    throw e;
  }
}

async function run() {
  const token = await login();
  const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  const endpoints = {
    rateLimitsConfig: () => fetch(baseUrl + '/api/rate-limits/config', { headers }),
    rateLimitsStats: () => fetch(baseUrl + '/api/rate-limits/stats', { headers }),
    auditStats: () => fetch(baseUrl + '/api/audit-trail/stats', { headers }),
    auditSearch: () => fetch(baseUrl + '/api/audit-trail/search', { method:'POST', headers, body: JSON.stringify({ query:'login', limit:10 }) }),
    auditCompliance: () => fetch(baseUrl + '/api/audit-trail/compliance?standard=general', { headers }),
    auditSecurityEvents: () => fetch(baseUrl + '/api/audit-trail/security-events', { headers }),
    rateLimitsBlockUnblock: async () => {
      const ip = '10.0.1.' + Math.floor(Math.random()*50+1);
      const blockStart = performance.now();
      const blockRes = await fetch(baseUrl + '/api/rate-limits/block', { method:'POST', headers, body: JSON.stringify({ ip, reason:'ci', duration:30 }) });
      const blockElapsed = performance.now() - blockStart;
      if (!blockRes.ok) throw new Error('Block failed HTTP ' + blockRes.status);
      await blockRes.arrayBuffer();
      await new Promise(r=>setTimeout(r, 8));
      let delElapsed = 0;
      let delRes = await fetch(baseUrl + '/api/rate-limits/' + ip, { method:'DELETE', headers });
      delElapsed = performance.now() - (blockStart + blockElapsed);
      if (!delRes.ok) {
        await new Promise(r=>setTimeout(r, 25));
        const retryStart = performance.now();
        delRes = await fetch(baseUrl + '/api/rate-limits/' + ip, { method:'DELETE', headers });
        delElapsed = performance.now() - retryStart;
        if (!delRes.ok) throw new Error('Unblock retry failed HTTP ' + delRes.status);
      }
      return { ip, blockMs: +blockElapsed.toFixed(2), unblockMs: +delElapsed.toFixed(2) };
    },
    rateLimitsMetrics: () => fetch(baseUrl + '/api/rate-limits/metrics', { headers }),
    auditExport: () => fetch(baseUrl + '/api/audit-trail/export?format=json', { headers })
  };

  const times = Object.fromEntries(Object.keys(endpoints).map(k => [k, []]));
  const errors = [];
  const tasks = Array.from({ length: iterations }, (_,i)=>i);

  async function worker() {
    while (tasks.length) {
      const idx = tasks.pop();
      for (const [name, fn] of Object.entries(endpoints)) {
        try {
          const res = await timed(name, fn, times);
          if (res instanceof Response) {
            if (!res.ok) throw new Error(name + ' HTTP ' + res.status);
            await res.arrayBuffer();
          }
        } catch (e) {
          errors.push({ iteration: idx, endpoint: name, error: e.message });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const summary = Object.fromEntries(Object.entries(times).map(([k,v]) => [k, stats(v)]));
  const report = { success: errors.length === 0, errors, iterations, concurrency, baseUrl, summary, generatedAt: new Date().toISOString() };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 3;
}

run().catch(err => { console.error(JSON.stringify({ success:false, error: err.message }, null, 2)); process.exit(1); });

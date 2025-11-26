// In-memory TTL cache used by analytics and system endpoints.
// Provides introspection and clearing to satisfy production admin requirements.
// Usage: const cache = require('./utils/cache'); cache.getOrSet(key, ttlMs, asyncFn)

const store = new Map();

function now() { return Date.now(); }

function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expire < now()) { store.delete(key); return undefined; }
    return entry.value;
}

function set(key, value, ttlMs) {
    store.set(key, { value, expire: now() + ttlMs });
    return value;
}

async function getOrSet(key, ttlMs, fn) {
    const existing = get(key);
    if (existing !== undefined) return existing;
    const value = await fn();
    set(key, value, ttlMs);
    return value;
}

function purge() {
    const t = now();
    for (const [k, v] of store.entries()) if (v.expire < t) store.delete(k);
}

function clearAll() {
    const count = store.size;
    store.clear();
    return count;
}

function stats(limit = 50) {
    purge(); // keep stats clean
    const entries = [];
    let i = 0;
    for (const [k, v] of store.entries()) {
        if (i++ >= limit) break;
        entries.push({ key: k, expiresInMs: v.expire - now() });
    }
    return {
        size: store.size,
        sample: entries,
        sampleLimit: limit
    };
}

setInterval(purge, 60000).unref();

module.exports = { get, set, getOrSet, clearAll, stats };

const express = require('express');
const router = express.Router();
const cache = require('../../utils/cache');
const { intParam } = require('../../utils/validate');

// NOTE: These endpoints implement the missing analytics feature set from the monolithic backup.
// They use direct SQL via req.dal.* for rapid restoration. Later we can migrate logic into DAL methods.

function safeInt(v, def=24, min=1, max=168){
  const n = parseInt(v); if(isNaN(n)) return def; return Math.min(Math.max(n,min),max);
}

// GET /api/analytics/activity - recent activity counts
router.get('/activity', async (req,res)=>{
  try {
    const last24h = await req.dal.getActivityLog(null, 500, 0) || [];
    res.json({ success:true, total:last24h.length, recent:last24h.slice(0,25) });
  } catch(err){
    req.app.locals?.loggers?.api?.error('analytics activity error', err); res.status(500).json({success:false,error:'failed'});
  }
});

// GET /api/analytics/stats - aggregate log stats
router.get('/stats', async (req,res)=>{
  try {
    const stats = await req.dal.getSystemStats();
    const sources = await req.dal.getLogSources();
    res.json({ success:true, stats, sourceCount:sources.length });
  } catch(err){
    req.app.locals?.loggers?.api?.error('analytics stats error', err); res.status(500).json({success:false,error:'failed'});
  }
});

// GET /api/analytics/top-sources
router.get('/top-sources', async (req,res)=>{
  try {
    const rows = await req.dal.getLogSources();
    res.json({ success:true, top: rows.slice(0,10) });
  } catch(err){
    res.status(500).json({success:false,error:'failed'});
  }
});

// GET /api/analytics/severities
router.get('/severities', async (req,res)=>{
  try {
    const rows = await req.dal.all("SELECT level as severity, COUNT(*) as count FROM logs WHERE timestamp >= datetime('now','-24 hours') GROUP BY level");
    res.json({ success:true, severities: rows });
  } catch(err){ res.status(500).json({success:false,error:'failed'}); }
});

// GET /api/analytics/categories
router.get('/categories', async (req,res)=>{
  try {
    const rows = await req.dal.all("SELECT COALESCE(category, source, 'System') as category, COUNT(*) as count FROM logs WHERE timestamp >= datetime('now','-24 hours') GROUP BY category ORDER BY count DESC LIMIT 25");
    res.json({ success:true, categories: rows });
  } catch(err){ res.status(500).json({success:false,error:'failed'}); }
});

// GET /api/analytics/histogram/hourly
router.get('/histogram/hourly', async (req,res)=>{
  try {
    const hours = intParam(req.query.hours,{def:24,min:1,max:168});
    const data = await cache.getOrSet('histogram_hourly_'+hours, 30_000, async () => {
      return await req.dal.all("SELECT strftime('%Y-%m-%d %H:00:00', timestamp) as bucket, COUNT(*) as count FROM logs WHERE timestamp >= datetime('now', ? ) GROUP BY bucket ORDER BY bucket DESC", [`-${hours} hours`]);
    });
    res.json({ success:true, hours, buckets: data });
  } catch(err){ res.status(500).json({success:false,error:'failed'}); }
});

// GET /api/analytics/histogram/daily
router.get('/histogram/daily', async (req,res)=>{
  try {
    const days = intParam(req.query.days,{def:7,min:1,max:30});
    const data = await cache.getOrSet('histogram_daily_'+days, 60_000, async () => {
      return await req.dal.all("SELECT strftime('%Y-%m-%d', timestamp) as bucket, COUNT(*) as count FROM logs WHERE timestamp >= datetime('now', ? ) GROUP BY bucket ORDER BY bucket DESC", [`-${days} days`]);
    });
    res.json({ success:true, days, buckets: data });
  } catch(err){ res.status(500).json({success:false,error:'failed'}); }
});

// GET /api/analytics/histogram/messages
router.get('/histogram/messages', async (req,res)=>{
  try {
    // use last 24h and group by level for a simple message distribution
    const rows = await req.dal.all("SELECT level, COUNT(*) as count FROM logs WHERE timestamp >= datetime('now','-24 hours') GROUP BY level");
    res.json({ success:true, distribution: rows });
  } catch(err){ res.status(500).json({success:false,error:'failed'}); }
});

// GET /api/analytics/heatmap/severity-time
router.get('/heatmap/severity-time', async (req,res)=>{
  try {
    const rows = await req.dal.all("SELECT strftime('%H', timestamp) as hour, level as severity, COUNT(*) as count FROM logs WHERE timestamp >= datetime('now','-24 hours') GROUP BY hour, severity");
    res.json({ success:true, points: rows });
  } catch(err){ res.status(500).json({success:false,error:'failed'}); }
});

// GET /api/analytics/anomalies - enhanced anomaly detection with z-score analysis
router.get('/anomalies', async (req,res)=>{
  try {
    const trend = await cache.getOrSet('anomalies_trend', 30_000, async () => await req.dal.getLogTrends(24));
    
    // Group by hour and level for statistical analysis
    const byHourLevel = {};
    trend.forEach(r => {
      const key = r.hour + '|' + r.level;
      if (!byHourLevel[key]) byHourLevel[key] = [];
      byHourLevel[key].push(r.count);
    });
    
    const anomalies = [];
    
    // Analyze each hour+level combination
    trend.forEach(r => {
      const key = r.hour + '|' + r.level;
      const samples = byHourLevel[key] || [];
      
      // Need at least 5 samples for meaningful stats
      if (samples.length < 5) {
        return;
      }
      
      // Calculate mean and standard deviation
      const mean = samples.reduce((a,b) => a+b, 0) / samples.length;
      const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length;
      const stdev = Math.sqrt(variance);
      
      // Calculate z-score for this data point
      const zScore = stdev > 0 ? (r.count - mean) / stdev : 0;
      
      // Flag anomalies where z-score >= 3 (99.7% confidence)
      if (Math.abs(zScore) >= 3) {
        let severity = 'medium';
        if (Math.abs(zScore) >= 5) severity = 'critical';
        else if (Math.abs(zScore) >= 4) severity = 'high';
        
        anomalies.push({
          hour: r.hour,
          level: r.level,
          count: r.count,
          mean: Number(mean.toFixed(2)),
          stdev: Number(stdev.toFixed(2)),
          zScore: Number(zScore.toFixed(2)),
          severity,
          deviation: zScore > 0 ? 'spike' : 'drop'
        });
      }
    });
    
    // Sort by absolute z-score (most significant first)
    anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
    
    // Fallback to simple avg*2 detection if no statistical anomalies
    if (anomalies.length === 0) {
      const errorCounts = trend.filter(r=>r.level==='error').map(r=>r.count);
      const avg = errorCounts.length ? errorCounts.reduce((a,b)=>a+b,0)/errorCounts.length : 0;
      const simpleAnomalies = trend.filter(r=>r.level==='error' && r.count > avg*2).map(r=>({
        hour:r.hour,
        level:r.level,
        count:r.count,
        mean:Number(avg.toFixed(2)),
        stdev: 0,
        zScore: 0,
        severity: 'low',
        deviation: 'spike'
      }));
      anomalies.push(...simpleAnomalies);
    }
    
    res.json({ 
      success: true, 
      anomalies,
      totalAnalyzed: trend.length,
      detectionMethod: anomalies.some(a => a.zScore > 0) ? 'z-score' : 'threshold'
    });
  } catch(err){ 
    req.app.locals?.loggers?.api?.error('anomalies detection error', err);
    res.status(500).json({success:false,error:'failed'}); 
  }
});

// GET /api/analytics/geolocation - resolve IPs to geo locations using geoip-lite
router.get('/geolocation', async (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit) || 500;
    const limit = Math.min(Math.max(limitRaw, 50), 5000); // clamp
    // Fetch recent logs (ensure timestamp ordering)
    const rows = await req.dal.all("SELECT ip, timestamp FROM logs WHERE ip IS NOT NULL AND ip != '' ORDER BY timestamp DESC LIMIT ?", [limit]) || [];
    if (!rows.length) return res.json({ success: true, totalLogs: 0, uniqueIPs: 0, externalIPs: 0, locations: [], byCountry: {}, message: 'No IP data in logs' });

    // Helper to determine if IP is private/local
    const isPrivate = (ip) => {
      if (!ip) return true;
      if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
      // IPv4 private ranges
      if (/^10\./.test(ip)) return true;
      if (/^192\.168\./.test(ip)) return true;
      const m = ip.match(/^172\.(\d+)\./); if (m && parseInt(m[1]) >=16 && parseInt(m[1]) <=31) return true;
      // Link-local / APIPA
      if (/^169\.254\./.test(ip)) return true;
      // Basic IPv6 local/site patterns
      if (/^fc|^fd|^fe80|^::1/.test(ip)) return true;
      return false;
    };

    const ipCounts = {};
    rows.forEach(r => { if (r.ip) ipCounts[r.ip] = (ipCounts[r.ip] || 0) + 1; });
    const allIPs = Object.keys(ipCounts);
    const externalIPs = allIPs.filter(ip => !isPrivate(ip));
    
    // Check for server location BEFORE early return (per Copilot instructions)
    let serverLocation = null;
    try {
      const latRow = await req.dal.get('SELECT setting_value FROM system_settings WHERE setting_key = ?', ['system.server_latitude']) || {};
      const lonRow = await req.dal.get('SELECT setting_value FROM system_settings WHERE setting_key = ?', ['system.server_longitude']) || {};
      const manualLat = latRow.setting_value ? parseFloat(latRow.setting_value) : null;
      const manualLon = lonRow.setting_value ? parseFloat(lonRow.setting_value) : null;
      if (typeof manualLat === 'number' && typeof manualLon === 'number' && manualLat >= -90 && manualLat <= 90 && manualLon >= -180 && manualLon <= 180) {
        serverLocation = {
          ip: 'manual',
          country: 'Configured',
          region: null,
          city: 'Edmonton',
          lat: manualLat,
          lon: manualLon,
          isServer: true,
          source: 'manual'
        };
      } else if (process.env.SERVER_PUBLIC_IP && !isPrivate(process.env.SERVER_PUBLIC_IP)) {
        // Try env override if manual config not set
        try {
          const geoipLite = require('geoip-lite');
          const lookup = geoipLite.lookup(process.env.SERVER_PUBLIC_IP);
          if (lookup && lookup.ll) {
            serverLocation = {
              ip: process.env.SERVER_PUBLIC_IP,
              country: lookup.country || 'UNK',
              region: lookup.region || null,
              city: lookup.city || null,
              lat: lookup.ll[0],
              lon: lookup.ll[1],
              isServer: true,
              source: 'env-override'
            };
          }
        } catch (_) { /* geoip-lite not available */ }
      }
    } catch (osErr) {
      console.warn('Server location detection failed:', osErr.message);
    }
    
    if (!externalIPs.length) {
      return res.json({ success: true, totalLogs: rows.length, uniqueIPs: allIPs.length, externalIPs: 0, locations: [], byCountry: {}, serverLocation: serverLocation || undefined, message: 'Only private/local IPs detected' });
    }

    let geoipLite;
    try { geoipLite = require('geoip-lite'); } catch (_) { /* graceful */ }
    if (!geoipLite) {
      return res.json({ success: true, totalLogs: rows.length, uniqueIPs: allIPs.length, externalIPs: externalIPs.length, locations: [], byCountry: {}, message: 'geoip-lite not available' });
    }

    const locations = [];
    const byCountry = {};
    externalIPs.forEach(ip => {
      const lookup = geoipLite.lookup(ip);
      if (!lookup || !lookup.ll) return; // Skip unresolved
      const count = ipCounts[ip];
      const loc = {
        ip,
        count,
        country: lookup.country || 'UNK',
        region: lookup.region || null,
        city: lookup.city || null,
        lat: lookup.ll[0],
        lon: lookup.ll[1]
      };
      locations.push(loc);
      byCountry[loc.country] = (byCountry[loc.country] || 0) + count;
    });

    // Sort locations by count desc and trim (avoid enormous payloads)
    locations.sort((a,b)=>b.count - a.count);
    const MAX_LOCATIONS = 300;
    const trimmed = locations.slice(0, MAX_LOCATIONS);

    // serverLocation already set above - no need to recalculate
    res.json({ 
      success: true,
      totalLogs: rows.length,
      uniqueIPs: allIPs.length,
      externalIPs: externalIPs.length,
      locations: trimmed,
      serverLocation: serverLocation || undefined,
      byCountry,
      timestamp: Date.now()
    });
  } catch (err) {
    req.app.locals?.loggers?.api?.error('analytics geolocation error', err);
    res.status(500).json({ success: false, error: 'failed' });
  }
});

// GET /api/analytics - simple summary endpoint
router.get('/', async (req, res) => {
  try {
    // Provide minimal analytics summary using existing helpers if available
    const stats = await req.dal.getSystemStats?.();
    res.json({ success: true, range: req.query.range || '24h', stats: stats || {} });
  } catch (err) {
    req.app.locals?.loggers?.api?.error('analytics root error', err);
    res.status(500).json({ success: false, error: 'failed' });
  }
});

module.exports = router;
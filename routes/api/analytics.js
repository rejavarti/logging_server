const express = require('express');
const router = express.Router();

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
    const hours = safeInt(req.query.hours,24);
    const rows = await req.dal.all("SELECT strftime('%Y-%m-%d %H:00:00', timestamp) as bucket, COUNT(*) as count FROM logs WHERE timestamp >= datetime('now', ? ) GROUP BY bucket ORDER BY bucket DESC", [`-${hours} hours`]);
    res.json({ success:true, hours, buckets: rows });
  } catch(err){ res.status(500).json({success:false,error:'failed'}); }
});

// GET /api/analytics/histogram/daily
router.get('/histogram/daily', async (req,res)=>{
  try {
    const days = safeInt(req.query.days,7,1,30);
    const rows = await req.dal.all("SELECT strftime('%Y-%m-%d', timestamp) as bucket, COUNT(*) as count FROM logs WHERE timestamp >= datetime('now', ? ) GROUP BY bucket ORDER BY bucket DESC", [`-${days} days`]);
    res.json({ success:true, days, buckets: rows });
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

// GET /api/analytics/anomalies - simplistic anomaly detection based on error spike
router.get('/anomalies', async (req,res)=>{
  try {
    const trend = await req.dal.getLogTrends(24);
    // naive anomaly: any hour where error count > avg * 2
    const levelBuckets = {};
    trend.forEach(r=>{ levelBuckets[r.hour] = levelBuckets[r.hour] || {}; levelBuckets[r.hour][r.level]=r.count; });
    const errorCounts = trend.filter(r=>r.level==='error').map(r=>r.count);
    const avg = errorCounts.length ? errorCounts.reduce((a,b)=>a+b,0)/errorCounts.length : 0;
    const anomalies = trend.filter(r=>r.level==='error' && r.count > avg*2).map(r=>({hour:r.hour,count:r.count,avg:Number(avg.toFixed(2))}));
    res.json({ success:true, avgErrorPerHour:Number(avg.toFixed(2)), anomalies });
  } catch(err){ res.status(500).json({success:false,error:'failed'}); }
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
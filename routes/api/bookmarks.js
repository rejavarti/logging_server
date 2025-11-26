const express = require('express');
const router = express.Router();
const { isNonEmptyString } = require('../../utils/validate');

async function ensureTable(dal){
  await dal.run("CREATE TABLE IF NOT EXISTS bookmarks (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, label TEXT NOT NULL, query TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
}

// GET /api/bookmarks
router.get('/', async (req,res)=>{
  try {
    await ensureTable(req.dal);
    const user = req.session?.user?.username || 'anonymous';
    const rows = await req.dal.all("SELECT id, label, query, created_at FROM bookmarks WHERE username = ? ORDER BY created_at DESC LIMIT 300", [user]);
    res.json({ success:true, bookmarks: rows });
  } catch(err){
    req.app.locals?.loggers?.api?.error('bookmarks list error', err);
    res.status(500).json({ success:false, error:'failed' });
  }
});

// POST /api/bookmarks
router.post('/', express.json(), async (req,res)=>{
  try {
    await ensureTable(req.dal);
    const user = req.session?.user?.username || 'anonymous';
    const label = (req.body?.label || '').trim();
    const query = (req.body?.query || '').trim();
    if(!isNonEmptyString(label)) return res.status(400).json({ success:false, error:'label required' });
    if(label.length > 200) return res.status(400).json({ success:false, error:'label too long' });
    if(query.length > 2000) return res.status(400).json({ success:false, error:'query too long' });
    const result = await req.dal.run("INSERT INTO bookmarks (username, label, query) VALUES (?, ?, ?)",[user,label,query]);
    res.json({ success:true, id: result.lastID });
  } catch(err){
    req.app.locals?.loggers?.api?.error('bookmark create error', err);
    res.status(500).json({ success:false, error:'failed' });
  }
});

// DELETE /api/bookmarks/:id
router.delete('/:id', async (req,res)=>{
  try {
    await ensureTable(req.dal);
    const user = req.session?.user?.username || 'anonymous';
    const id = parseInt(req.params.id,10);
    if(!id) return res.status(400).json({ success:false, error:'invalid id' });
    const existing = await req.dal.get("SELECT id FROM bookmarks WHERE id = ? AND username = ?", [id,user]);
    if(!existing) return res.status(404).json({ success:false, error:'not found' });
    await req.dal.run("DELETE FROM bookmarks WHERE id = ?", [id]);
    res.json({ success:true, deleted:id });
  } catch(err){
    req.app.locals?.loggers?.api?.error('bookmark delete error', err);
    res.status(500).json({ success:false, error:'failed' });
  }
});

module.exports = router;

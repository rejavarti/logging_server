const express = require('express');
const router = express.Router();
const { isNonEmptyString } = require('../../utils/validate');

// Ensure table exists (lazy init)
async function ensureTable(dal){
  await dal.run("CREATE TABLE IF NOT EXISTS user_notes (id SERIAL PRIMARY KEY, username TEXT NOT NULL, text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())");
}

// GET /api/notes - list notes for current user
router.get('/', async (req,res)=>{
  try {
    await ensureTable(req.dal);
    const user = req.session?.user?.username || 'anonymous';
    const rows = await req.dal.all("SELECT id, text, created_at FROM user_notes WHERE username = $1 ORDER BY created_at DESC LIMIT 200", [user]);
    res.json({ success:true, notes: rows });
  } catch(err){
    req.app.locals?.loggers?.api?.error('notes list error', err);
    res.status(500).json({ success:false, error:'failed' });
  }
});

// POST /api/notes - create note
router.post('/', express.json(), async (req,res)=>{
  try {
    await ensureTable(req.dal);
    const user = req.session?.user?.username || 'anonymous';
    const text = (req.body?.text || '').trim();
    if(!isNonEmptyString(text)) return res.status(400).json({ success:false, error:'text required' });
    if(text.length > 5000) return res.status(400).json({ success:false, error:'text too long' });
    const result = await req.dal.run("INSERT INTO user_notes (username, text) VALUES ($1, $2)", [user, text]);
    res.json({ success:true, id: result.lastID });
  } catch(err){
    req.app.locals?.loggers?.api?.error('notes create error', err);
    res.status(500).json({ success:false, error:'failed' });
  }
});

// DELETE /api/notes/:id - delete note
router.delete('/:id', async (req,res)=>{
  try {
    await ensureTable(req.dal);
    const user = req.session?.user?.username || 'anonymous';
    const id = parseInt(req.params.id,10);
    if(!id) return res.status(400).json({ success:false, error:'invalid id' });
    const existing = await req.dal.get("SELECT id FROM user_notes WHERE id = $1 AND username = $2", [id,user]);
    if(!existing) return res.status(404).json({ success:false, error:'not found' });
    await req.dal.run("DELETE FROM user_notes WHERE id = $1", [id]);
    res.json({ success:true, deleted:id });
  } catch(err){
    req.app.locals?.loggers?.api?.error('notes delete error', err);
    res.status(500).json({ success:false, error:'failed' });
  }
});

module.exports = router;

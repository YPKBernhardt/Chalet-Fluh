// Calendar-specific storage — independent of Vercel Blob
// Uses JSONBin.io (free JSON storage API)
// Setup (2 minutes):
//   1. Go to https://jsonbin.io → create free account
//   2. Click "Create Bin", paste: {"cal_extra_booked":"[]","cal_force_unbooked":"[]"}
//   3. Copy the BIN ID and your Master Key
//   4. In Vercel dashboard → Settings → Environment Variables:
//      JSONBIN_BIN_ID    = <your bin id>
//      JSONBIN_MASTER_KEY = <your master key>

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const BIN_ID = process.env.JSONBIN_BIN_ID || '69cce593aaba882197b3fa7c';
  const KEY    = process.env.JSONBIN_MASTER_KEY || '$2a$10$AtM/PbDFkGXUGN44IZI5Z..x9pCcIeZ5vw.J9pyNaAyOcHI6Y/xSG';

  if (req.method === 'GET') {
    if (!BIN_ID || !KEY) return res.status(200).json({});
    try {
      const r = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
        headers: { 'X-Master-Key': KEY, 'X-Bin-Meta': 'false' }
      });
      if (!r.ok) return res.status(200).json({});
      const json = await r.json();
      return res.status(200).json(json.record || json || {});
    } catch (_) {
      return res.status(200).json({});
    }
  }

  if (req.method === 'POST') {
    if (!BIN_ID || !KEY) return res.status(503).json({ error: 'Calendar storage not configured. See api/calendar.js for setup instructions.' });
    const { data, password } = req.body || {};
    const expectedPw = process.env.ADMIN_PASSWORD || 'Schumpen12345!';
    if (password !== expectedPw) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const r = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': KEY
        },
        body: JSON.stringify(data || {})
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => 'unknown error');
        return res.status(500).json({ error: `JSONBin error: ${errText}` });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
};

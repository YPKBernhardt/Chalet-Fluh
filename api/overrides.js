const { put, list, del } = require('@vercel/blob');

const PREFIX = 'cf-manifest';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Blob not configured – return empty overrides gracefully
    return res.status(200).json({});
  }

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: PREFIX });
      if (!blobs.length) return res.status(200).json({});
      // Take the latest manifest
      const latest = blobs.sort(
        (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
      )[0];
      const r = await fetch(latest.url + '?t=' + Date.now());
      const data = await r.json();
      return res.status(200).json(data);
    } catch (e) {
      console.error('overrides GET error:', e);
      return res.status(200).json({});
    }
  }

  if (req.method === 'POST') {
    const { overrides, password } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Only persist text and blob URLs — never raw base64 image data
    const clean = {};
    for (const [k, v] of Object.entries(overrides || {})) {
      if (typeof v === 'string' && !v.startsWith('data:')) clean[k] = v;
    }

    try {
      // Replace old manifest blobs
      const { blobs } = await list({ prefix: PREFIX });
      if (blobs.length) await del(blobs.map(b => b.url));

      await put(PREFIX + '.json', JSON.stringify(clean), {
        access: 'public',
        contentType: 'application/json',
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('overrides POST error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
};

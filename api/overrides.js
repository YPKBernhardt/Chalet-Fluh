const { put, del } = require('@vercel/blob');

// Fixed pathname — no random suffix, so URL is deterministic
const MANIFEST_PATHNAME = 'cf-overrides.json';

// Derive the blob URL from the token without any SDK call (0 Advanced Requests)
function getManifestUrl() {
  const token = process.env.BLOB_READ_WRITE_TOKEN || '';
  const m = token.match(/vercel_blob_rw_([a-zA-Z0-9]+)_/);
  if (!m) return null;
  return `https://${m[1]}.public.blob.vercel-storage.com/${MANIFEST_PATHNAME}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(200).json({});
  }

  if (req.method === 'GET') {
    // Zero Advanced Requests — just an HTTP fetch of a known URL
    const url = getManifestUrl();
    if (!url) return res.status(200).json({});
    try {
      const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return res.status(200).json({});
      const data = await r.json();
      return res.status(200).json(data);
    } catch (_) {
      return res.status(200).json({});
    }
  }

  if (req.method === 'POST') {
    const { overrides, password } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Only persist blob URLs and text — never raw base64
    const clean = {};
    for (const [k, v] of Object.entries(overrides || {})) {
      if (typeof v === 'string' && !v.startsWith('data:')) clean[k] = v;
    }

    try {
      // Delete old manifest (ignore if it doesn't exist yet)
      const oldUrl = getManifestUrl();
      if (oldUrl) { try { await del(oldUrl); } catch (_) {} }

      // Write new manifest at fixed URL, cacheControlMaxAge:0 ensures CDN always serves fresh content
      await put(MANIFEST_PATHNAME, JSON.stringify(clean), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('overrides POST error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
};

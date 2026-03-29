const { put, del } = require('@vercel/blob');

function getStoreHash() {
  const token = process.env.BLOB_READ_WRITE_TOKEN || '';
  const m = token.match(/vercel_blob_rw_([a-zA-Z0-9]+)_/);
  return m ? m[1] : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { key, dataUrl, password } = req.body || {};

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Blob storage not configured' });
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!key || !dataUrl || !dataUrl.startsWith('data:')) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  try {
    const [header, base64] = dataUrl.split(',');
    const mimeType = (header.match(/:(.*?);/) || [])[1] || 'image/jpeg';
    const buffer = Buffer.from(base64, 'base64');

    const pathname = `cf-img-${key}.jpg`;

    // Delete old blob at the deterministic URL (no list() needed — 1 op instead of 2)
    const storeHash = getStoreHash();
    if (storeHash) {
      const oldUrl = `https://${storeHash}.public.blob.vercel-storage.com/${pathname}`;
      try { await del(oldUrl); } catch (_) {}
    }

    // Upload new image at fixed pathname
    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
      cacheControlMaxAge: 0,
    });

    return res.status(200).json({ url: blob.url });
  } catch (e) {
    console.error('upload-image error:', e);
    return res.status(500).json({ error: e.message });
  }
};

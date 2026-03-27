const { put, list, del } = require('@vercel/blob');

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

    // Remove any existing blob for this key
    const prefix = `cf-img-${key}`;
    const { blobs } = await list({ prefix });
    if (blobs.length) await del(blobs.map(b => b.url));

    const blob = await put(prefix + '.jpg', buffer, {
      access: 'public',
      contentType: mimeType,
    });

    return res.status(200).json({ url: blob.url });
  } catch (e) {
    console.error('upload-image error:', e);
    return res.status(500).json({ error: e.message });
  }
};

// Upload images to GitHub repo (brand_assets/uploads/) — free, permanent, no Blob needed.
// Returns a raw.githubusercontent.com URL usable on any device worldwide.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { key, dataUrl, password } = req.body || {};

  const expectedPw = process.env.ADMIN_PASSWORD || 'Schumpen12345!';
  if (password !== expectedPw) return res.status(401).json({ error: 'Unauthorized' });
  if (!key || !dataUrl || !dataUrl.startsWith('data:')) return res.status(400).json({ error: 'Invalid input' });

  const ghToken = process.env.GITHUB_TOKEN;
  const ghOwner = process.env.VERCEL_GIT_REPO_OWNER;
  const ghSlug  = process.env.VERCEL_GIT_REPO_SLUG;

  if (!ghToken || !ghOwner || !ghSlug) {
    return res.status(503).json({ error: 'GitHub not configured' });
  }

  try {
    const [header, base64] = dataUrl.split(',');
    const ext = (header.match(/image\/(\w+)/) || [])[1] || 'jpg';
    const filename = `brand_assets/uploads/${key.replace(/[^a-z0-9-]/gi, '-')}.${ext}`;
    const apiUrl = `https://api.github.com/repos/${ghOwner}/${ghSlug}/contents/${filename}`;
    const headers = {
      'Authorization': `Bearer ${ghToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Chalet-Fluh-Admin/1.0',
    };

    // Check if file already exists (need SHA to update)
    let sha;
    const getRes = await fetch(apiUrl, { headers });
    if (getRes.ok) sha = (await getRes.json()).sha;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Admin: upload image ${key}`,
        content: base64,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!putRes.ok) {
      const err = await putRes.text().catch(() => '');
      return res.status(500).json({ error: `GitHub upload failed: ${err}` });
    }

    // Return the raw URL — publicly accessible immediately
    const rawUrl = `https://raw.githubusercontent.com/${ghOwner}/${ghSlug}/main/${filename}`;
    return res.status(200).json({ url: rawUrl });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

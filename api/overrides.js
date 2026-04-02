const { put, del } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');

const MANIFEST_PATHNAME = 'cf-overrides.json';

function getBlobUrl() {
  const token = process.env.BLOB_READ_WRITE_TOKEN || '';
  const m = token.match(/vercel_blob_rw_([a-zA-Z0-9]+)_/);
  if (!m) return null;
  return `https://${m[1]}.public.blob.vercel-storage.com/${MANIFEST_PATHNAME}`;
}

// Read overrides.json committed to the repo (fallback when Blob is suspended)
function readLocalOverrides() {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'overrides.json'), 'utf8'));
  } catch (_) { return {}; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    // Try Blob first (0 Advanced Requests when store is active)
    const blobUrl = getBlobUrl();
    if (blobUrl) {
      try {
        const r = await fetch(blobUrl + '?t=' + Date.now(), { cache: 'no-store' });
        if (r.ok) {
          const data = await r.json();
          if (data && Object.keys(data).length) return res.status(200).json(data);
        }
      } catch (_) {}
    }
    // Fallback: read the overrides.json committed to the repo.
    // This file is updated by GitHub API on every admin save, so it always
    // reflects the latest saved state — even when Blob is suspended.
    return res.status(200).json(readLocalOverrides());
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { overrides, password } = req.body || {};
    const expectedPw = process.env.ADMIN_PASSWORD || 'Schumpen12345!';
    if (password !== expectedPw) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Strip base64 and companion '-url' keys. For image keys that have a companion
    // key+'-url' (the GitHub raw URL), store that URL in the manifest instead.
    // The '-url' keys are internal tracking only and never stored on the server.
    const clean = {};
    for (const [k, v] of Object.entries(overrides || {})) {
      if (k.endsWith('-url')) continue;
      if (typeof v === 'string' && v.startsWith('data:')) {
        const remoteUrl = overrides[k + '-url'];
        if (remoteUrl) clean[k] = remoteUrl;
        // else: image not yet uploaded to GitHub — skip entirely, don't bloat manifest
      } else {
        clean[k] = v;
      }
    }

    const saved = { github: false, blob: false };

    // ── Primary: GitHub API ────────────────────────────────────────────────
    // Commits overrides.json to the repo → Vercel auto-deploys (~90s) →
    // all visitors worldwide read the new data from the static file.
    // Requires: GITHUB_TOKEN env var (Personal Access Token, repo scope).
    // VERCEL_GIT_REPO_OWNER + VERCEL_GIT_REPO_SLUG are built-in Vercel vars.
    const ghToken = process.env.GITHUB_TOKEN;
    const ghOwner = process.env.VERCEL_GIT_REPO_OWNER;
    const ghSlug  = process.env.VERCEL_GIT_REPO_SLUG;

    if (ghToken && ghOwner && ghSlug) {
      try {
        const apiUrl = `https://api.github.com/repos/${ghOwner}/${ghSlug}/contents/overrides.json`;
        const headers = {
          'Authorization': `Bearer ${ghToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Chalet-Fluh-Admin/1.0',
        };
        // Get current SHA (required for updates)
        let sha;
        const getRes = await fetch(apiUrl, { headers });
        if (getRes.ok) sha = (await getRes.json()).sha;

        const content = Buffer.from(JSON.stringify(clean, null, 2)).toString('base64');
        const putRes = await fetch(apiUrl, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            message: 'Admin: update overrides',
            content,
            ...(sha ? { sha } : {}),
          }),
        });
        if (putRes.ok) saved.github = true;
      } catch (e) {
        console.error('GitHub save error:', e.message);
      }
    }

    // ── Secondary: Vercel Blob ─────────────────────────────────────────────
    // Used as a fast CDN layer when the store is active. Also serves as
    // backup if GitHub is not yet configured.
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const oldUrl = getBlobUrl();
        if (oldUrl) { try { await del(oldUrl); } catch (_) {} }
        await put(MANIFEST_PATHNAME, JSON.stringify(clean), {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
          cacheControlMaxAge: 0,
        });
        saved.blob = true;
      } catch (_) {}
    }

    if (saved.github || saved.blob) {
      return res.status(200).json({ ok: true, github: saved.github, blob: saved.blob });
    }

    return res.status(503).json({
      error: 'Save failed. Add GITHUB_TOKEN in Vercel → Settings → Environment Variables.',
    });
  }

  return res.status(405).end();
};

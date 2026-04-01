module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD || 'Schumpen12345!';
  if (password === expected) return res.status(200).json({ ok: true });
  return res.status(401).json({ error: 'Unauthorized' });
};

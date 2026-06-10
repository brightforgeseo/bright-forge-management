const { proxy } = require('../_proxy');

module.exports = (req, res) => proxy(req, res, {
  targetHost: 'echo-ai.tailfdbc33.ts.net',
  targetPort: 10000,
  mountPath: '/api/supabase',
  path: req.query.path
});

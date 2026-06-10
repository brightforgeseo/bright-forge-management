const { proxy } = require('../_proxy');

module.exports = (req, res) => proxy(req, res, {
  targetHost: 'echo-ai.tailfdbc33.ts.net',
  targetPort: 8443,
  mountPath: '/api/bridge',
  path: req.query.path
});

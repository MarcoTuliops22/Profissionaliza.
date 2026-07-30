const visitors = require('./visitors');
const guardian = require('./guardian');

module.exports = async function handler(req, res) {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;

  if (pathname === '/api/guardian' || pathname === '/guardian') {
    return guardian(req, res);
  }

  if (pathname === '/api/visitors' || pathname === '/visitors') {
    return visitors(req, res);
  }

  res.status(200).json({
    success: true,
    message: 'API Profissionaliza disponível.',
    endpoints: ['/api/visitors', '/api/guardian']
  });
};

const visitors = require('./visitors');
const guardian = require('./guardian');

module.exports = async function handler(req, res) {
  const pathname = req.url || '/';
  if (pathname.startsWith('/api/guardian')) {
    return guardian(req, res);
  }
  return visitors(req, res);
};

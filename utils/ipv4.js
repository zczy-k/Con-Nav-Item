const http = require('http');
const https = require('https');
const dns = require('dns');

// Shared agents to force IPv4 connections.
// Some servers have broken IPv6 routing while DNS returns AAAA records.
// Providing a custom lookup with family=4 ensures the socket connects using IPv4.

let cached = null;

function isForceIPv4Enabled() {
  return !['0', 'false', 'no', 'off'].includes(String(process.env.FORCE_IPV4 || '').toLowerCase());
}

function ipv4Lookup(hostname, options, callback) {
  let opts = options;
  let cb = callback;

  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  if (typeof opts === 'number') {
    opts = { family: 4 };
  } else {
    opts = { ...(opts || {}), family: 4 };
  }

  return dns.lookup(hostname, opts, cb);
}

function getForcedIPv4Agents() {
  if (!isForceIPv4Enabled()) {
    return { httpAgent: undefined, httpsAgent: undefined };
  }
  if (cached) return cached;

  // keepAlive reduces connection setup overhead for frequent WebDAV ops
  const httpAgent = new http.Agent({ keepAlive: true, lookup: ipv4Lookup });
  const httpsAgent = new https.Agent({ keepAlive: true, lookup: ipv4Lookup });
  cached = { httpAgent, httpsAgent };
  return cached;
}

module.exports = {
  getForcedIPv4Agents
};

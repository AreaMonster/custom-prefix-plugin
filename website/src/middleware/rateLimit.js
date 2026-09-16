'use strict';

// Very small in-memory per-IP rate limiter. The token itself is the real
// access control (256 bits of entropy makes guessing infeasible), so this
// is defense-in-depth against noisy/broken clients, not a security
// boundary on its own.
function createRateLimiter({ windowMs = 60_000, max = 20 } = {}) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (now > entry.resetAt) hits.delete(ip);
    }
  }, windowMs).unref?.();

  return function rateLimit(req, res, next) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: 'too many requests, slow down' });
    }
    next();
  };
}

module.exports = { createRateLimiter };

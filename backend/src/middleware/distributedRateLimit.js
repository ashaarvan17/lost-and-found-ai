const crypto = require("node:crypto");
const RateLimitBucket = require("../models/RateLimitBucket");

let indexesReady;

function hmac(value) {
  const secret = process.env.RATE_LIMIT_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("Rate-limit hashing is not configured.");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function bucketFor(value, namespace, now, windowMs) {
  const bucketStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  return {
    key: hmac(`${namespace}:${value}`),
    bucketStart: new Date(bucketStartMs),
    expiresAt: new Date(bucketStartMs + (2 * windowMs)),
  };
}

async function incrementBucket(bucket) {
  try {
    return await RateLimitBucket.findOneAndUpdate(
      { key: bucket.key, bucketStart: bucket.bucketStart },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: bucket.expiresAt } },
      { upsert: true, new: true },
    ).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    // A parallel request may have inserted the unique bucket first.
    const updated = await RateLimitBucket.findOneAndUpdate(
      { key: bucket.key, bucketStart: bucket.bucketStart },
      { $inc: { count: 1 } },
      { new: true },
    ).lean();
    if (!updated) throw error;
    return updated;
  }
}

function distributedRateLimit({ namespace, limit, windowMs, identity }) {
  if (!namespace || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1000) {
    throw new TypeError("A rate limit requires a namespace, positive limit, and window of at least one second.");
  }

  return async (req, res, next) => {
    try {
      if (!indexesReady) indexesReady = RateLimitBucket.init();
      await indexesReady;
      const now = new Date();
      const subjects = [`ip:${req.ip || req.socket?.remoteAddress || "unknown"}`];
      if (identity) {
        const value = identity(req);
        if (typeof value === "string" && value.trim()) subjects.push(`identity:${value.trim().toLowerCase()}`);
      }
      let exceeded = false;
      for (const subject of subjects) {
        const bucket = await incrementBucket(bucketFor(subject, namespace, now, windowMs));
        exceeded ||= bucket.count > limit;
      }
      if (exceeded) {
        const retrySeconds = Math.max(1, Math.ceil((Math.floor(now.getTime() / windowMs) * windowMs + windowMs - now.getTime()) / 1000));
        res.set("Retry-After", String(retrySeconds));
        return res.status(429).json({ success: false, message: "Too many requests. Please try again later." });
      }
      return next();
    } catch {
      indexesReady = null;
      // Sensitive operations fail closed if shared rate-limit storage is unavailable.
      return res.status(503).json({ success: false, message: "This operation is temporarily unavailable." });
    }
  };
}

module.exports = { distributedRateLimit, bucketFor, incrementBucket };

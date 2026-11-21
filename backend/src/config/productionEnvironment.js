function validateProductionEnvironment(env = process.env) {
  if (env.NODE_ENV !== "production") return [];

  const missing = [];
  const requireSecret = (name) => {
    const value = env[name];
    if (typeof value !== "string" || value.length < 32 || /replace_with|your_|example/i.test(value)) missing.push(name);
  };
  requireSecret("JWT_SECRET");
  requireSecret("RATE_LIMIT_HASH_SECRET");
  requireSecret("AI_SERVICE_TOKEN");
  if (env.JWT_SECRET && env.RATE_LIMIT_HASH_SECRET && env.JWT_SECRET === env.RATE_LIMIT_HASH_SECRET) missing.push("RATE_LIMIT_HASH_SECRET (must differ from JWT_SECRET)");

  for (const name of ["MONGODB_URI", "IMAGEKIT_PUBLIC_KEY", "IMAGEKIT_PRIVATE_KEY", "IMAGEKIT_URL_ENDPOINT", "AI_SERVICE_URL", "CORS_ORIGINS"]) {
    if (!env[name] || /replace_with|your_|example/i.test(env[name])) missing.push(name);
  }
  try {
    const uri = new URL(env.MONGODB_URI);
    const dbName = decodeURIComponent(uri.pathname.replace(/^\//, ""));
    if (!dbName || /(^|_)(dev|test|local)$/i.test(dbName) || /localhost|127\.0\.0\.1/i.test(uri.hostname)) missing.push("MONGODB_URI (must target the production database)");
  } catch {
    if (env.MONGODB_URI) missing.push("MONGODB_URI (invalid connection URI)");
  }
  try {
    if (new URL(env.IMAGEKIT_URL_ENDPOINT).protocol !== "https:") missing.push("IMAGEKIT_URL_ENDPOINT (HTTPS required)");
  } catch {
    if (env.IMAGEKIT_URL_ENDPOINT) missing.push("IMAGEKIT_URL_ENDPOINT (invalid URL)");
  }
  const origins = String(env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (!origins.length || origins.some((origin) => {
    try { return new URL(origin).origin !== origin || new URL(origin).protocol !== "https:"; }
    catch { return true; }
  })) missing.push("CORS_ORIGINS (exact HTTPS origins required)");
  if (env.AI_SERVICE_URL) {
    try {
      const aiUrl = new URL(env.AI_SERVICE_URL);
      if (aiUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(aiUrl.hostname)) missing.push("AI_SERVICE_URL (HTTPS required outside localhost)");
    } catch { missing.push("AI_SERVICE_URL (invalid URL)"); }
  }
  if (env.TRUST_PROXY && env.TRUST_PROXY !== "true" && !/^\d+$/.test(env.TRUST_PROXY)) missing.push("TRUST_PROXY (true or a numeric hop count)");
  return [...new Set(missing)];
}

function assertProductionEnvironment(env = process.env) {
  const invalid = validateProductionEnvironment(env);
  if (invalid.length) throw new Error(`Production configuration is incomplete: ${invalid.join(", ")}`);
}

module.exports = { validateProductionEnvironment, assertProductionEnvironment };

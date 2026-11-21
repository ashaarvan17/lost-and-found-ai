const REQUIRED_DATABASE_NAME = "findback_ai_dev";
const REQUIRED_FRONTEND_ORIGIN = "http://localhost:5173";

function getDevelopmentConfigurationErrors(env = process.env, existingEnvironment = {}) {
  const errors = [];
  if (env.NODE_ENV !== "development") {
    errors.push("NODE_ENV must be development.");
  }

  let uri;
  try {
    uri = new URL(env.MONGODB_URI || "");
  } catch {
    errors.push("MONGODB_URI must point to the configured development Atlas database.");
  }

  if (uri) {
    const databaseName = decodeURIComponent(uri.pathname.replace(/^\//, ""));
    if (databaseName !== REQUIRED_DATABASE_NAME) {
      errors.push(`MONGODB_URI must use the ${REQUIRED_DATABASE_NAME} database.`);
    }

    let existingUri;
    try {
      existingUri = new URL(existingEnvironment.MONGODB_URI || "");
    } catch {
      errors.push("The existing backend/.env must contain the Atlas URI used by this development setup.");
    }
    if (existingUri) {
      const existingDatabaseName = decodeURIComponent(existingUri.pathname.replace(/^\//, ""));
      if (existingDatabaseName === REQUIRED_DATABASE_NAME) {
        errors.push("The development database must remain separate from the database selected by backend/.env.");
      }
      const isAtlasSrv = uri.protocol === "mongodb+srv:" &&
        existingUri.protocol === "mongodb+srv:" &&
        uri.hostname.toLowerCase().endsWith(".mongodb.net") &&
        existingUri.hostname.toLowerCase().endsWith(".mongodb.net");
      const sameAtlasConfiguration = isAtlasSrv &&
        uri.hostname === existingUri.hostname &&
        uri.username === existingUri.username &&
        uri.password === existingUri.password &&
        uri.search === existingUri.search &&
        uri.hash === existingUri.hash &&
        !uri.port &&
        !existingUri.port;
      if (!sameAtlasConfiguration) {
        errors.push("Development MongoDB must reuse the Atlas cluster and connection options in backend/.env.");
      }
    }
  }

  for (const name of ["JWT_SECRET", "RATE_LIMIT_HASH_SECRET", "AI_SERVICE_TOKEN"]) {
    const value = env[name];
    if (typeof value !== "string" || value.length < 32 || /replace_with|development-only-placeholder/i.test(value)) {
      errors.push(`${name} must be a development secret of at least 32 characters.`);
    }
  }
  const secrets = [env.JWT_SECRET, env.RATE_LIMIT_HASH_SECRET, env.AI_SERVICE_TOKEN].filter(Boolean);
  if (new Set(secrets).size !== secrets.length) {
    errors.push("JWT_SECRET, RATE_LIMIT_HASH_SECRET, and AI_SERVICE_TOKEN must be different values.");
  }

  for (const name of ["IMAGEKIT_PUBLIC_KEY", "IMAGEKIT_PRIVATE_KEY"]) {
    const value = env[name];
    if (typeof value !== "string" || !value.trim() || /your_|replace|local-development-not-configured/i.test(value)) {
      errors.push(`${name} must be configured for the development ImageKit integration.`);
    }
  }
  try {
    const imageKitEndpoint = new URL(env.IMAGEKIT_URL_ENDPOINT || "");
    if (imageKitEndpoint.protocol !== "https:" || imageKitEndpoint.hostname !== "ik.imagekit.io" || imageKitEndpoint.pathname === "/") {
      errors.push("IMAGEKIT_URL_ENDPOINT must be the configured HTTPS ImageKit endpoint.");
    }
  } catch {
    errors.push("IMAGEKIT_URL_ENDPOINT must be the configured HTTPS ImageKit endpoint.");
  }
  if (env.IMAGEKIT_UPLOAD_FOLDER !== "/findback-ai/development/items") {
    errors.push("IMAGEKIT_UPLOAD_FOLDER must use the development-only upload folder.");
  }

  for (const [name, expectedPath] of [["AI_SERVICE_URL", "/match-text"], ["IMAGE_VALIDATION_URL", "/validate-image"]]) {
    try {
      const serviceUrl = new URL(env[name] || "");
      if (!["127.0.0.1", "localhost"].includes(serviceUrl.hostname) || serviceUrl.port !== "8000" || serviceUrl.pathname !== expectedPath) {
        errors.push(`${name} must target the local AI service on port 8000.`);
      }
    } catch {
      errors.push(`${name} must target the local AI service on port 8000.`);
    }
  }

  const origins = String(env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length !== 1 || origins[0] !== REQUIRED_FRONTEND_ORIGIN) {
    errors.push(`CORS_ORIGINS must be exactly ${REQUIRED_FRONTEND_ORIGIN}.`);
  }

  if (env.PORT !== "4000") {
    errors.push("PORT must be 4000 for the local development frontend configuration.");
  }

  return errors;
}

function assertDevelopmentEnvironment(env = process.env, existingEnvironment = {}) {
  const errors = getDevelopmentConfigurationErrors(env, existingEnvironment);
  if (errors.length) {
    throw new Error(`Unsafe local development configuration: ${errors.join(" ")}`);
  }
}

module.exports = { getDevelopmentConfigurationErrors, assertDevelopmentEnvironment };

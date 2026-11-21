import { defineConfig } from "@playwright/test";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(frontendDir, "..", "backend");
const apiOrigin = "http://127.0.0.1:4180";
const frontendOrigin = "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: frontendOrigin, browserName: "chromium", headless: true },
  webServer: [
    {
      command: "node --require ./scripts/configure-test-dns.js server.js",
      cwd: backendDir,
      url: `${apiOrigin}/api/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: "4180",
        CORS_ORIGINS: frontendOrigin,
        AI_SERVICE_URL: "http://127.0.0.1:1/match-text",
        IMAGE_VALIDATION_URL: "http://127.0.0.1:1/validate-image",
        IMAGEKIT_PUBLIC_KEY: process.env.IMAGEKIT_PUBLIC_KEY || "test-public-key",
        IMAGEKIT_PRIVATE_KEY: process.env.IMAGEKIT_PRIVATE_KEY || "test-private-key",
        IMAGEKIT_URL_ENDPOINT: process.env.IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/test-only",
      },
    },
    {
      command: process.platform === "win32"
        ? "npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort"
        : "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
      cwd: frontendDir,
      url: frontendOrigin,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { ...process.env, VITE_API_BASE_URL: `${apiOrigin}/api` },
    },
  ],
});

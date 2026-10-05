// PM2 process manifest for the hosted QCall MCP server (https://mcp.qcall.ai/mcp).
//
// Usage on the server (Node 20+):
//   npm ci && npm run build
//   pm2 start ecosystem.config.cjs --env production
//   pm2 save
//   pm2 reload qcall-mcp     # zero-downtime reload after a deploy
//   pm2 logs qcall-mcp
//
// nginx (sites-available/mcp.qcall.ai) proxies https://mcp.qcall.ai -> 127.0.0.1:8788.

module.exports = {
  apps: [
    {
      name: "qcall-mcp",
      script: "./dist/http-server.js",
      exec_mode: "cluster", // stateless server, safe to run several workers
      instances: 2,
      max_memory_restart: "512M",
      kill_timeout: 10000,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "30s",
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "development",
        HOST: "127.0.0.1",
        PORT: 8788,
        QCALL_API_BASE_URL: "http://localhost:3000/api/v1",
        PUBLIC_MCP_URL: "http://localhost:8788/mcp",
      },
      env_production: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 8788,
        // Same box as api.qcall.ai: call the API on loopback, skip TLS + nginx hop.
        QCALL_API_BASE_URL: "http://127.0.0.1:3000/api/v1",
        PUBLIC_MCP_URL: "https://mcp.qcall.ai/mcp",
        // Secrets are NOT set here: put MCP_OAUTH_SECRET, GOOGLE_CLIENT_ID and
        // RECAPTCHA_SITE_KEY in ./.env (gitignored), loaded at startup.
      },
    },
  ],
};

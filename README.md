# QCall AI MCP Server

[Model Context Protocol](https://modelcontextprotocol.io) server for [QCall AI](https://qcall.ai). Lets Claude, ChatGPT, Cursor, VS Code and any MCP client manage AI voice assistants, place calls, run campaigns, manage contacts and knowledge bases, and read call transcripts.

Setup guide: https://qcall.ai/mcp

## Hosted server (recommended)

```
https://mcp.qcall.ai/mcp
```

**Claude.ai / ChatGPT / Claude Desktop (one-click):** add a custom connector with the URL above and click Connect. A QCall sign-in page opens (email + password with reCAPTCHA, optional Google). After sign-in the server creates an MCP API key named after the app (e.g. `Claude via claude.ai (MCP connector · you@company.com)`); the client receives an OAuth access token carrying it. Revoking that key in QCall → Integrations → AI Assistants (MCP) disconnects the app.

**API-key clients:** create a key in QCall → Integrations → AI Assistants (MCP) (`qc_live_…`, shown once) and send it as a Bearer token:

```bash
# Claude Code
claude mcp add --transport http qcall https://mcp.qcall.ai/mcp \
  --header "Authorization: Bearer YOUR_QCALL_API_KEY"
```

```json
// Cursor (~/.cursor/mcp.json)
{ "mcpServers": { "qcall": { "url": "https://mcp.qcall.ai/mcp",
  "headers": { "Authorization": "Bearer YOUR_QCALL_API_KEY" } } } }
```

## Local (stdio)

```bash
npm install && npm run build
QCALL_API_KEY=qc_live_... node dist/index.js
```

```json
// Claude Desktop (claude_desktop_config.json)
{ "mcpServers": { "qcall": { "command": "node", "args": ["/path/to/mcp/dist/index.js"],
  "env": { "QCALL_API_KEY": "qc_live_..." } } } }
```

## Tools (38)

| Group | Tools |
|---|---|
| Account | `qcall_get_balance`, `qcall_get_active_plan`, `qcall_list_transactions` |
| Assistants | `qcall_list_assistants`, `qcall_get_assistant`, `qcall_create_assistant`, `qcall_update_assistant`, `qcall_list_voices` |
| Calls & numbers | `qcall_place_call`*, `qcall_list_calls`, `qcall_list_campaign_call_logs`, `qcall_get_call_transcript`, `qcall_list_phone_numbers`, `qcall_list_dialers` |
| Contacts | `qcall_list_contact_lists`, `qcall_create_contact_list`, `qcall_list_contacts`, `qcall_add_contact` |
| Campaigns | `qcall_list_campaigns`, `qcall_create_campaign`, `qcall_start_campaign`*, `qcall_pause_campaign`, `qcall_resume_campaign`* |
| Knowledge & analytics | `qcall_list_knowledge_bases`, `qcall_create_knowledge_base`, `qcall_get_dashboard_stats` |
| Tags | `qcall_list_tags`, `qcall_create_tag`, `qcall_tag_contacts`, `qcall_untag_contact` |
| CRM | `qcall_search_contacts`, `qcall_get_contact`, `qcall_get_contact_call_history`, `qcall_list_custom_fields` |
| Activity & callbacks | `qcall_list_activities`, `qcall_list_callbacks`, `qcall_reschedule_callback`, `qcall_cancel_callback`* |

\* Spends wallet balance, rings real phones or cancels a scheduled call: requires `confirm: true`, which the model may only set after the user approved.

Not exposed on purpose: deleting anything, buying numbers, dialer/SIP credentials, reseller and admin features. Assistant voice, AI model and knowledge-base selection are set in the QCall app (they need provider data the app's pickers build).

## Security model

- Stateless proxy: every request is executed with the caller's own key against `api.qcall.ai` (`x-api-key`); the server stores nothing.
- MCP keys are hashed in QCall (shown once), scoped to one workspace, and cannot mint session tokens or manage other keys.
- OAuth 2.1 (PKCE S256, Dynamic Client Registration) with AES-256-GCM sealed, stateless client ids / codes / tokens. Rotating `MCP_OAUTH_SECRET` disconnects every connector.
- Unverified redirect targets get a phishing warning on the sign-in page; strict CSP and anti-framing headers.
- Rate limits: failed auth per IP, requests per key. Logs never contain keys, tokens or bodies.

## Self-hosting / deployment

```bash
npm ci && npm run build
cp .env.example .env   # set MCP_OAUTH_SECRET (>= 32 chars), GOOGLE_CLIENT_ID, RECAPTCHA_SITE_KEY
pm2 start ecosystem.config.cjs --env production
```

nginx proxies `https://mcp.qcall.ai` → `127.0.0.1:8788`. Add `mcp.qcall.ai` to the reCAPTCHA key's domains and to the Google OAuth client's authorized origins.

Smoke test: `MCP_URL=https://mcp.qcall.ai/mcp QCALL_API_KEY=qc_live_... npm run smoke`

## Development

```bash
npm run dev:http     # hosted mode with reload (QCALL_API_BASE_URL=http://localhost:3000/api/v1)
npm run type-check
npm test
```

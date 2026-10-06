/**
 * Calls to the existing QCall account endpoints used by the OAuth sign-in page.
 * We log the user in exactly like app.qcall.ai does (email + password with
 * reCAPTCHA, or Google), then mint an `mcp` API key named after the connecting
 * AI client. That key is what the OAuth access token carries, so revoking it in
 * QCall (Integrations → AI Assistants) disconnects the client.
 *
 * QCall reports most failures as HTTP 200 with `{ success: false, message }`.
 */

import axios, { type AxiosError } from "axios";

export type LoginResult =
  | { kind: "token"; jwt: string; email?: string }
  | { kind: "error"; message: string };

interface QcallLoginData {
  token?: string;
  email?: string;
  steps?: number;
  workspace_id?: string | null;
}

// A previous connector key is replaced only if it is at least this much older than the new one.
const STALE_KEY_AGE_MS = 10 * 60 * 1000;

const ok = (status: number, data: any) => status >= 200 && status < 300 && data?.success !== false;

export class QcallAccountApi {
  constructor(private readonly apiBaseUrl: string) {}

  private request(method: "get" | "post" | "delete", path: string, options: { body?: unknown; headers?: Record<string, string> } = {}) {
    return axios.request({
      method,
      url: `${this.apiBaseUrl}${path}`,
      data: options.body,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...options.headers },
      timeout: 15_000,
      maxRedirects: 0,
      validateStatus: () => true
    });
  }

  private static toLoginResult(status: number, body: any): LoginResult {
    const data: QcallLoginData | undefined = body?.data;
    if (ok(status, body) && data?.token) {
      // steps === 0: sign-up onboarding not finished, so there is no usable workspace yet.
      // Google login omits workspace_id from the response; it is always in the JWT.
      if (data.steps === 0 || !(data.workspace_id ?? jwtWorkspaceId(data.token))) {
        return { kind: "error", message: "Finish setting up your QCall account at app.qcall.ai, then connect again." };
      }
      return { kind: "token", jwt: data.token, email: data.email };
    }
    if (status === 429) return { kind: "error", message: "Too many attempts. Please wait a minute and try again." };
    if (status >= 500) return { kind: "error", message: "QCall is temporarily unavailable. Please try again." };
    // One message for every credential failure: don't reveal which emails have accounts.
    return { kind: "error", message: "Incorrect email or password, or this account can't sign in here." };
  }

  async loginWithPassword(email: string, password: string, recaptchaToken: string, clientIp?: string): Promise<LoginResult> {
    try {
      // The backend verifies the reCAPTCHA solution sent in the `token` header (platform key).
      const res = await this.request("post", "/user/login", {
        body: { email, password },
        headers: { token: recaptchaToken, ...forwardedFor(clientIp) }
      });
      return QcallAccountApi.toLoginResult(res.status, res.data);
    } catch (error) {
      return networkError(error);
    }
  }

  async loginWithGoogle(credential: string, clientId: string, clientIp?: string): Promise<LoginResult> {
    try {
      const res = await this.request("post", "/user/google-auth", {
        body: { credential, clientId },
        headers: forwardedFor(clientIp)
      });
      return QcallAccountApi.toLoginResult(res.status, res.data);
    } catch (error) {
      return networkError(error);
    }
  }

  /**
   * Creates an `mcp` API key in the user's default workspace. The name identifies
   * app, destination and user so it is recognisable in QCall's connected-apps list.
   */
  async createConnectorApiKey(
    jwt: string,
    connection: { clientName: string; destination: string; email?: string; workspace?: string }
  ): Promise<{ apiKey: string } | { error: string }> {
    try {
      // Email + workspace make the name unique per user and workspace (reconnect cleanup matches it exactly).
      const who = (connection.email ? ` · ${connection.email}` : "") + (connection.workspace ? ` · ${connection.workspace}` : "");
      const name = `${connection.clientName} via ${connection.destination} (MCP connector${who})`.slice(0, 150);
      const auth = { Authorization: `Bearer ${jwt}` };
      const res = await this.request("post", "/api-key/create", { body: { name, kind: "mcp" }, headers: auth });
      const apiKey = res.data?.data?.api_key;
      if (ok(res.status, res.data) && typeof apiKey === "string") {
        // Only when the name is user-specific (email known): never touch other users' keys.
        if (connection.email) await this.deleteOlderConnectorKeys(name, res.data?.data?.id, res.data?.data?.created_at, auth);
        return { apiKey };
      }
      if (res.status === 403) {
        return {
          error: "Your role in this workspace can't create API keys. Ask a workspace admin to connect, or to change your role."
        };
      }
      return { error: res.data?.message || "Could not create access for this connection." };
    } catch (error) {
      return { error: (networkError(error) as { message: string }).message };
    }
  }

  /**
   * Reconnecting the same app replaces the user's previous connector key instead of
   * piling up keys. Matches the exact key name (app + destination + email) and only
   * "(MCP connector" keys; best effort — a failure just leaves an extra key behind.
   */
  private async deleteOlderConnectorKeys(
    name: string,
    keepId: string | undefined,
    keepCreatedAt: unknown,
    auth: Record<string, string>
  ): Promise<void> {
    if (!keepId || !name.includes("(MCP connector")) return;
    // Only keys from an EARLIER connection count as stale: a second sign-in seconds later (double
    // click, retried redirect) must not delete the key the client is still holding. Both times
    // come from the database, so server clocks and time zones don't matter.
    const newest = Date.parse(String(keepCreatedAt));
    if (!Number.isFinite(newest)) return;
    try {
      const list = await this.request("get", "/api-key/list?kind=mcp", { headers: auth });
      if (!ok(list.status, list.data)) {
        console.error(`[oauth] key cleanup: list keys -> ${list.status}`);
        return;
      }
      const stale = ((list.data?.data || []) as Array<{ id?: string; name?: string; created_at?: string }>).filter(
        (key) => key.name === name && key.id && key.id !== keepId && newest - Date.parse(String(key.created_at)) > STALE_KEY_AGE_MS
      );
      for (const key of stale) {
        const del = await this.request("delete", `/api-key/delete?id=${encodeURIComponent(key.id!)}`, { headers: auth });
        if (!ok(del.status, del.data)) console.error(`[oauth] key cleanup: delete -> ${del.status}`);
      }
      if (stale.length) console.log(`[oauth] replaced ${stale.length} older connector key(s)`);
    } catch (error) {
      console.error("[oauth] could not clean up older connector keys:", (error as Error).message);
    }
  }
}

/** workspace_id claim of a QCall login JWT (read only, not verified: it came straight from the API). */
export function jwtWorkspaceId(jwt: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload?.workspace_id === "string" && payload.workspace_id ? payload.workspace_id : undefined;
  } catch {
    return undefined;
  }
}

function forwardedFor(clientIp?: string): Record<string, string> {
  return clientIp ? { "X-Forwarded-For": clientIp } : {};
}

function networkError(error: unknown): LoginResult {
  console.error("[oauth] QCall API unreachable:", (error as AxiosError).message);
  return { kind: "error", message: "QCall is temporarily unavailable. Please try again." };
}

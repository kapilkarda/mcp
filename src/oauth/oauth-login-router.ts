/**
 * POST /oauth/login — handles the QCall sign-in form rendered by /authorize.
 * Steps: password (with reCAPTCHA) | google. On success mints an `mcp` API key
 * for the connecting client and redirects back to it with an authorization code.
 */

import express, { type Request, type Response, Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { QcallOAuthProvider, PendingAuthRequest } from "./qcall-oauth-provider.js";
import { sendHtml } from "./qcall-oauth-provider.js";
import { QcallAccountApi, jwtWorkspaceId, type LoginResult } from "./qcall-account-api.js";
import { QcallWorkspaceApi, type WorkspaceChoice } from "./qcall-workspace-api.js";
import { renderErrorPage, renderLoginPage, renderWorkspacePage } from "./oauth-login-pages.js";
import { isTrustedRedirect, redirectLabel } from "./oauth-client-policy.js";

const field = (body: Record<string, unknown>, name: string, max = 4096): string =>
  typeof body[name] === "string" ? (body[name] as string).trim().slice(0, max) : "";

const PICK_TTL_MS = 10 * 60 * 1000;
const MAX_WORKSPACES = 50;
/** Sealed between the workspace page and its POST: login token, email, offered workspaces. */
interface PickPayload { j: string; e?: string; w: WorkspaceChoice[] }

export function createOAuthLoginRouter(options: {
  provider: QcallOAuthProvider;
  accountApi: QcallAccountApi;
  workspaceApi: QcallWorkspaceApi;
}): Router {
  const { provider, accountApi, workspaceApi } = options;
  const { googleClientId } = provider.page;
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip || "unknown"),
    handler: (_req, res) =>
      sendHtml(res, renderErrorPage("Too many sign-in attempts. Please wait 15 minutes."), { status: 429 })
  });

  router.post(
    "/oauth/login",
    loginLimiter,
    express.urlencoded({ extended: false, limit: "32kb" }),
    async (req: Request, res: Response) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const sealedRequest = field(body, "request");
      const pending = provider.openAuthRequest(sealedRequest);
      if (!pending) {
        sendHtml(res, renderErrorPage("This sign-in link has expired."), { status: 400 });
        return;
      }
      // `pending` is sealed and was created only after the SDK validated redirect_uri
      // (including RFC 8252 loopback port matching), so only the client must still exist.
      const client = await provider.clientsStore.getClient(pending.cid);
      if (!client) {
        sendHtml(res, renderErrorPage("Unknown application. Please reconnect."), { status: 400 });
        return;
      }
      const clientName = client.client_name || "An AI assistant";
      const destination = redirectLabel(pending.ru);

      const showLogin = (error: string, email?: string) =>
        sendHtml(
          res,
          renderLoginPage({
            authRequest: sealedRequest,
            clientName,
            redirectHost: destination,
            verified: isTrustedRedirect(pending.ru),
            ...provider.page,
            email,
            error
          }),
          { ...provider.page, redirectUri: pending.ru, status: 400 }
        );

      const step = field(body, "step", 16);
      const email = field(body, "email", 320);
      let result: LoginResult;

      // Second page for multi-workspace users: exchange the login token for the chosen workspace's.
      if (step === "workspace") {
        const pick = provider.sealer.open<PickPayload>("wspick", field(body, "pick", 8192));
        const choice = pick?.w[Number.parseInt(field(body, "index", 4), 10)];
        if (!pick || !choice) return showLogin("Workspace selection expired. Please sign in again.");
        const token = await workspaceApi.workspaceToken(pick.j, choice);
        if (!token) {
          sendHtml(res, renderErrorPage("Could not open that workspace. Please try again."), { status: 403 });
          return;
        }
        await completeAuthorization(res, pending, token, { clientName, destination, email: pick.e, workspace: choice.name });
        return;
      }

      try {
        if (step === "password") {
          const captcha = field(body, "g-recaptcha-response", 8192);
          if (provider.page.recaptchaSiteKey && !captcha) return showLogin("Please complete the security check.", email);
          result = await accountApi.loginWithPassword(email, field(body, "password", 1024), captcha, req.ip);
        } else if (step === "google" && googleClientId) {
          result = await accountApi.loginWithGoogle(field(body, "credential", 8192), googleClientId, req.ip);
        } else {
          return showLogin("Please sign in.");
        }
      } catch (error) {
        console.error("[oauth] login step failed:", (error as Error).message);
        return showLogin("Something went wrong. Please try again.", email);
      }

      if (result.kind === "error") return showLogin(result.message, email);

      // Login tokens point at the user's oldest owned workspace; let members of several choose.
      const workspaces = (await workspaceApi.listWorkspaces(result.jwt)).slice(0, MAX_WORKSPACES);
      if (workspaces.length > 1) {
        const defaultId = jwtWorkspaceId(result.jwt);
        const ordered = [...workspaces].sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId));
        const pick = provider.sealer.seal("wspick", { j: result.jwt, e: result.email, w: ordered }, PICK_TTL_MS);
        sendHtml(
          res,
          renderWorkspacePage({
            authRequest: sealedRequest,
            pick,
            clientName,
            email: result.email,
            workspaces: ordered.map((w) => ({ name: w.name, role: w.role, isDefault: w.id === defaultId }))
          }),
          { ...provider.page, redirectUri: pending.ru }
        );
        return;
      }
      await completeAuthorization(res, pending, result.jwt, { clientName, destination, email: result.email, workspace: workspaces[0]?.name });
    }
  );

  async function completeAuthorization(
    res: Response,
    pending: PendingAuthRequest,
    jwt: string,
    connection: { clientName: string; destination: string; email?: string; workspace?: string }
  ) {
    const created = await accountApi.createConnectorApiKey(jwt, connection);
    if ("error" in created) {
      sendHtml(res, renderErrorPage(created.error), { status: 403 });
      return;
    }
    const redirect = new URL(pending.ru);
    redirect.searchParams.set("code", provider.issueCode(pending, created.apiKey));
    if (pending.st) redirect.searchParams.set("state", pending.st);
    const safeName = connection.clientName.replace(/[^\w .()-]/g, "").slice(0, 60);
    console.log(`[oauth] connected client "${safeName}" -> ${connection.destination.replace(/[^\w.:-]/g, "")}`);
    res.redirect(303, redirect.toString());
  }

  return router;
}

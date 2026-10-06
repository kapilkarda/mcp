/**
 * Server-rendered QCall sign-in pages for the MCP OAuth flow (no framework, no
 * external assets besides the logo, reCAPTCHA and optional Google Identity
 * Services). All dynamic values are HTML-escaped.
 */

// Same light-theme logo, fonts and palette as app.qcall.ai's sign-in page.
export const LOGO_URL = "https://qcall.ai/_next/image?url=%2Fqcall-logo.png&w=384&q=75";
export const FONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap";

const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STYLES = `
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;
background:#f4efe8 radial-gradient(rgb(28 26 24/.07) 1px,transparent 1px) 0 0/14px 14px;color:#2f2b27;
font:15px/1.55 "IBM Plex Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.card{width:100%;max-width:440px;background:#faf7f2;border:1px solid rgb(28 26 24/.12);border-radius:2px;padding:36px 32px}
.logo{height:40px;display:block;margin:0 auto 22px}
h1{font-family:"Newsreader",Georgia,"Times New Roman",serif;font-weight:400;font-size:26px;letter-spacing:-.01em;text-align:center;margin:0 0 8px}
.sub{color:#55504a;margin:0 0 22px;font-size:14px;text-align:center}.sub b{color:#2f2b27;font-weight:600}
label{display:block;font-family:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:500;margin:16px 0 6px;color:#2f2b27}
input{width:100%;padding:11px 12px;border:1px solid rgb(28 26 24/.22);border-radius:2px;font:inherit;font-size:14px;background:#fff;color:#2f2b27}
input::placeholder{color:#8a8279}
input:focus{outline:2px solid rgb(184 69 31/.25);outline-offset:0;border-color:#b8451f}
button{width:100%;margin-top:22px;padding:13px;border:0;border-radius:2px;background:#b8451f;color:#f7f3ec;cursor:pointer;
font:500 14px/1 "IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em}
button:hover{background:#9a3818}
.err{background:rgb(184 69 31/.07);border:1px solid rgb(184 69 31/.3);color:#9a3818;padding:10px 12px;border-radius:2px;font-size:13px;margin-bottom:6px}
.warn{background:#fff7e6;border-color:#e8b14f;color:#7a4b00}
.or{display:flex;align-items:center;gap:14px;color:#55504a;font-size:13px;margin:22px auto 6px;max-width:220px}
.or:before,.or:after{content:"";flex:1;height:1px;background:rgb(28 26 24/.18)}
#g{display:flex;justify-content:center;margin-top:12px;min-height:44px}
.foot{margin-top:22px;font-size:12.5px;color:#55504a;text-align:center}.foot a{color:#b8451f;text-decoration:none}.foot a:hover{text-decoration:underline}
.grecaptcha-badge{visibility:hidden}
.ws{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:10px;padding:14px 16px;background:#fff;color:#2f2b27;
border:1px solid rgb(28 26 24/.18);text-align:left;font:500 14px/1.3 "IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;letter-spacing:0}
.ws:hover{background:#fff;border-color:#b8451f}.ws small{font:12px "IBM Plex Mono",ui-monospace,monospace;color:#706a5f;white-space:nowrap}`;

function layout(title: string, body: string, head = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · QCall AI</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONT_CSS_URL}">
<style>${STYLES}</style>${head}</head>
<body><main class="card"><img class="logo" src="${LOGO_URL}" alt="QCall.ai">${body}</main></body></html>`;
}

function errorBox(error?: string): string {
  return error ? `<div class="err" role="alert">${esc(error)}</div>` : "";
}

export interface LoginPageOptions {
  authRequest: string;
  clientName: string;
  redirectHost: string;
  /** false = redirect target isn't a known AI app: show a phishing warning. */
  verified: boolean;
  googleClientId?: string;
  recaptchaSiteKey?: string;
  email?: string;
  error?: string;
}

/**
 * Password form. With a reCAPTCHA site key the submit button runs an invisible
 * reCAPTCHA v2 challenge first; its solution is posted as `g-recaptcha-response`.
 */
function passwordForm(o: LoginPageOptions): string {
  const submit = o.recaptchaSiteKey
    ? `<button type="submit" class="g-recaptcha" data-sitekey="${esc(o.recaptchaSiteKey)}" data-callback="onPw">Sign in &amp; allow access</button>
<script>function onPw(){var f=document.getElementById("pw");if(!f.reportValidity()){grecaptcha.reset();return}if(f.dataset.sent)return;f.dataset.sent="1";f.submit()}</script>`
    : `<button type="submit">Sign in &amp; allow access</button>`;
  return `<form id="pw" method="post" action="/oauth/login" onsubmit="if(this.dataset.sent)return false;this.dataset.sent=1">
<input type="hidden" name="request" value="${esc(o.authRequest)}"><input type="hidden" name="step" value="password">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" placeholder="mail@yourcompanyname.com" required value="${esc(o.email || "")}">
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Your QCall password" required>
${submit}</form>`;
}

function googleForm(o: LoginPageOptions): string {
  if (!o.googleClientId) return "";
  return `<div class="or">Or</div>
<form id="gform" method="post" action="/oauth/login">
<input type="hidden" name="request" value="${esc(o.authRequest)}"><input type="hidden" name="step" value="google">
<input type="hidden" name="credential" id="gcred"></form><div id="g"></div>
<script>function onGoogle(r){var f=document.getElementById("gform");if(f.dataset.sent)return;f.dataset.sent="1";document.getElementById("gcred").value=r.credential;f.submit()}
window.addEventListener("load",function(){google.accounts.id.initialize({client_id:${JSON.stringify(o.googleClientId)},callback:onGoogle});
google.accounts.id.renderButton(document.getElementById("g"),{theme:"outline",size:"large",shape:"pill",width:340,text:"signin_with",logo_alignment:"center"})})</script>`;
}

export function renderLoginPage(o: LoginPageOptions): string {
  const head =
    (o.recaptchaSiteKey ? `<script src="https://www.google.com/recaptcha/api.js" async defer></script>` : "") +
    (o.googleClientId ? `<script src="https://accounts.google.com/gsi/client" async defer></script>` : "");
  return layout(
    "Sign in",
    `<h1>Sign in to QCall.ai</h1>
<p class="sub"><b>${esc(o.clientName)}</b> wants to use your QCall workspace (assistants, calls, campaigns, contacts) and will return you to <b>${esc(o.redirectHost)}</b>.</p>
${o.verified ? "" : `<div class="err warn" role="alert"><b>Unverified app.</b> QCall has not verified this app. Only continue if you started this connection yourself and trust <b>${esc(o.redirectHost)}</b>; it will get access to your QCall workspace, including placing calls that use your wallet balance.</div>`}
${errorBox(o.error)}
${passwordForm(o)}
${googleForm(o)}
<p class="foot">Access uses an API key named after this app. Revoke it any time in QCall under Integrations → AI Assistants (MCP).
No account? <a href="https://app.qcall.ai" target="_blank" rel="noopener">Create one</a>.
${o.recaptchaSiteKey ? `Protected by reCAPTCHA (Google <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Privacy</a> · <a href="https://policies.google.com/terms" target="_blank" rel="noopener">Terms</a>).` : ""}</p>`,
    head
  );
}

export interface WorkspacePageOptions {
  authRequest: string;
  /** sealed "wspick" payload: login token + the workspaces offered */
  pick: string;
  clientName: string;
  email?: string;
  workspaces: Array<{ name: string; role?: string; isDefault: boolean }>;
}

/** Shown after sign-in when the user belongs to more than one workspace. */
export function renderWorkspacePage(o: WorkspacePageOptions): string {
  const rows = o.workspaces
    .map(
      (w, i) =>
        `<button type="submit" class="ws" name="index" value="${i}"><span>${esc(w.name)}${w.isDefault ? " · default" : ""}</span>` +
        `${w.role ? `<small>${esc(w.role)}</small>` : ""}</button>`
    )
    .join("");
  return layout(
    "Choose a workspace",
    `<h1>Choose a workspace</h1>
<p class="sub"><b>${esc(o.clientName)}</b> will work in the workspace you pick${o.email ? ` for <b>${esc(o.email)}</b>` : ""}. To use another workspace later, disconnect and connect again.</p>
<form method="post" action="/oauth/login" onsubmit="if(this.dataset.sent)return false;this.dataset.sent=1">
<input type="hidden" name="request" value="${esc(o.authRequest)}"><input type="hidden" name="step" value="workspace">
<input type="hidden" name="pick" value="${esc(o.pick)}">${rows}</form>`
  );
}

export function renderErrorPage(message: string): string {
  return layout(
    "Connection error",
    `<h1>Couldn't connect</h1>${errorBox(message)}
<p class="foot">Close this window and click <b>Connect</b> again in your AI assistant.</p>`
  );
}

/**
 * Server-rendered QCall sign-in pages for the MCP OAuth flow (no framework, no
 * external assets besides the logo, reCAPTCHA and optional Google Identity
 * Services). All dynamic values are HTML-escaped.
 */

export const LOGO_URL = "https://qcall.ai/qcall-logo-white.png";

const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STYLES = `
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#1a1a1e;color:#f4f4f6;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:16px}
.card{width:100%;max-width:400px;background:#222226;border:1px solid #3c3c42;border-radius:12px;padding:32px}
.logo{height:30px;display:block;margin-bottom:24px}h1{font-size:22px;margin:0 0 6px;font-weight:600}
.sub{color:#b4b4bc;margin:0 0 22px;font-size:14px}.sub b{color:#fff}
label{display:block;font-size:13px;font-weight:600;margin:14px 0 6px}
input{width:100%;padding:11px 12px;border:1px solid #3c3c42;border-radius:8px;font:inherit;background:#1a1a1e;color:#fff}
input:focus{outline:2px solid #8a63f8;border-color:#6e3cf0}
button{width:100%;margin-top:20px;padding:12px;border:0;border-radius:8px;background:#6e3cf0;color:#fff;
font:600 14px/1 inherit;cursor:pointer}button:hover{background:#5a27d8}
.err{background:rgb(240 80 80/.1);border:1px solid rgb(240 80 80/.35);color:#ff9b9b;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:6px}
.or{display:flex;align-items:center;gap:10px;color:#8a8a94;font-size:12px;margin:20px 0 4px}
.or:before,.or:after{content:"";flex:1;height:1px;background:#3c3c42}
.foot{margin-top:22px;font-size:12px;color:#8a8a94}.foot a{color:#8a63f8}
.grecaptcha-badge{visibility:hidden}#g{display:flex;justify-content:center;margin-top:12px}`;

function layout(title: string, body: string, head = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · QCall AI</title><style>${STYLES}</style>${head}</head>
<body><main class="card"><img class="logo" src="${LOGO_URL}" alt="QCall AI">${body}</main></body></html>`;
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
<script>function onPw(){var f=document.getElementById("pw");if(!f.reportValidity()){grecaptcha.reset();return}f.submit()}</script>`
    : `<button type="submit">Sign in &amp; allow access</button>`;
  return `<form id="pw" method="post" action="/oauth/login">
<input type="hidden" name="request" value="${esc(o.authRequest)}"><input type="hidden" name="step" value="password">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required value="${esc(o.email || "")}">
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
${submit}</form>`;
}

function googleForm(o: LoginPageOptions): string {
  if (!o.googleClientId) return "";
  return `<div class="or">or</div>
<form id="gform" method="post" action="/oauth/login">
<input type="hidden" name="request" value="${esc(o.authRequest)}"><input type="hidden" name="step" value="google">
<input type="hidden" name="credential" id="gcred"></form><div id="g"></div>
<script>function onGoogle(r){document.getElementById("gcred").value=r.credential;document.getElementById("gform").submit()}
window.addEventListener("load",function(){google.accounts.id.initialize({client_id:${JSON.stringify(o.googleClientId)},callback:onGoogle});
google.accounts.id.renderButton(document.getElementById("g"),{theme:"filled_black",size:"large",width:336,text:"continue_with"})})</script>`;
}

export function renderLoginPage(o: LoginPageOptions): string {
  const head =
    (o.recaptchaSiteKey ? `<script src="https://www.google.com/recaptcha/api.js" async defer></script>` : "") +
    (o.googleClientId ? `<script src="https://accounts.google.com/gsi/client" async defer></script>` : "");
  return layout(
    "Sign in",
    `<h1>Sign in to QCall AI</h1>
<p class="sub"><b>${esc(o.clientName)}</b> wants to use your QCall workspace (assistants, calls, campaigns, contacts) and will return you to <b>${esc(o.redirectHost)}</b>.</p>
${o.verified ? "" : `<div class="err" role="alert"><b>Unverified app.</b> QCall has not verified this app. Only continue if you started this connection yourself and trust <b>${esc(o.redirectHost)}</b>; it will get access to your QCall workspace, including placing calls that use your wallet balance.</div>`}
${errorBox(o.error)}
${passwordForm(o)}
${googleForm(o)}
<p class="foot">Access uses an API key named after this app. Revoke it any time in QCall under Integrations → AI Assistants (MCP).
No account? <a href="https://app.qcall.ai" target="_blank" rel="noopener">Create one</a>.
${o.recaptchaSiteKey ? `Protected by reCAPTCHA (Google <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Privacy</a> · <a href="https://policies.google.com/terms" target="_blank" rel="noopener">Terms</a>).` : ""}</p>`,
    head
  );
}

export function renderErrorPage(message: string): string {
  return layout(
    "Connection error",
    `<h1>Couldn't connect</h1>${errorBox(message)}
<p class="foot">Close this window and click <b>Connect</b> again in your AI assistant.</p>`
  );
}

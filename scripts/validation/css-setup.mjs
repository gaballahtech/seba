/**
 * Create an account, password login and pod on a local Community Solid Server.
 *
 * Usage:
 *   node scripts/validation/css-setup.mjs
 *
 * Prints JSON with the credentials and WebID; pass them to css-flow.mjs through the
 * environment (CSS_EMAIL, CSS_PASSWORD, WEBID).
 */

const base = process.env["CSS_BASE"] ?? "http://localhost:3000";
const email = process.env["CSS_EMAIL"] ?? `seba-${Date.now()}@example.com`;
const password = process.env["CSS_PASSWORD"] ?? "SebaPassw0rd!";
const podName = process.env["CSS_POD"] ?? `seba${String(Date.now()).slice(-6)}`;

async function postJson(url, body, token) {
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (token !== undefined) {
    headers["authorization"] = `CSS-Account-Token ${token}`;
  }
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`POST ${url} failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return parsed;
}

const created = await postJson(`${base}/.account/account/`);
const token = created.authorization;
if (typeof token !== "string") {
  throw new Error(`Account creation returned no authorization token: ${JSON.stringify(created)}`);
}

const index = await fetch(`${base}/.account/`, {
  headers: { authorization: `CSS-Account-Token ${token}`, accept: "application/json" },
});
const controls = (await index.json()).controls;
if (controls?.password?.create === undefined || controls?.account?.pod === undefined) {
  throw new Error(`Account API controls are incomplete: ${JSON.stringify(controls)}`);
}

await postJson(controls.password.create, { email, password }, token);
const pod = await postJson(controls.account.pod, { name: podName }, token);

const webIds = await (await fetch(controls.account.webId, {
  headers: { authorization: `CSS-Account-Token ${token}`, accept: "application/json" },
})).json();

const link = webIds?.webIdLinks?.[pod.webId] ?? Object.keys(webIds?.webIdLinks ?? {})[0];
if (typeof link !== "string") {
  throw new Error(`No WebID was linked to the account: ${JSON.stringify(webIds)}`);
}

// The pod creation response names the generated WebID; the account API maps it to the
// resource that proves the link. Authentication must use the WebID itself.
const generatedWebId = typeof pod.webId === "string" ? pod.webId : Object.keys(webIds.webIdLinks)[0];

console.log(JSON.stringify({ email, password, webId: generatedWebId, link, podBaseUrl: pod.webId }, null, 2));

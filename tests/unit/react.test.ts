import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SebaLoginButton, useSession } from "../../src/react/index.js";

function SessionProbe(): ReturnType<typeof createElement> {
  const session = useSession(null);
  return createElement("span", null, session === null ? "signed-out" : session.webId);
}

describe("React bindings", () => {
  it("server-renders the custom element with its configuration", () => {
    const html = renderToString(
      createElement(SebaLoginButton, {
        clientId: "https://app.example/client-id.jsonld",
        redirectUri: "https://app.example/callback",
        issuer: "https://idp.example",
        label: "Sign in",
        theme: "dark",
        config: { tolerances: { "https://idp.example": { allowNonCompliantCnf: true } } },
      }),
    );
    expect(html).toContain("<seba-login");
    expect(html).toContain("allowNonCompliantCnf");
    expect(html).toContain('client-id="https://app.example/client-id.jsonld"');
    expect(html).toContain('redirect-uri="https://app.example/callback"');
    expect(html).toContain('issuer="https://idp.example"');
    expect(html).toContain('label="Sign in"');
    expect(html).toContain('theme="dark"');
  });

  it("renders an unauthenticated session without a client", () => {
    expect(renderToString(createElement(SessionProbe))).toContain("signed-out");
  });
});

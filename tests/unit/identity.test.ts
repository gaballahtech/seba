import { describe, expect, it, vi } from "vitest";
import {
  assertRedirectUriPublished,
  discoverIssuerForWebId,
  extractIssuerStatements,
  extractJsonLdIssuers,
  loadClientIdDocument,
  OIDC_ISSUER_PREDICATE,
  parseClientIdDocument,
  parseLinkHeader,
  parseTurtle,
  SOLID_OIDC_CONTEXT,
  validateWebId,
} from "../../src/core/identity.js";
import { SebaConfigError, SebaDiscoveryError, SebaRedirectMismatchError } from "../../src/core/errors.js";

const CLIENT_ID = "https://app.example/client-id.jsonld";
const REDIRECT_URI = "https://app.example/auth/callback";

function clientDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "@context": [SOLID_OIDC_CONTEXT],
    client_id: CLIENT_ID,
    client_name: "Test app",
    redirect_uris: [REDIRECT_URI],
    ...overrides,
  };
}

function turtleResponse(body: string, contentType = "text/turtle"): Response {
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

describe("parseClientIdDocument", () => {
  it("accepts a valid Solid Client ID Document", () => {
    const parsed = parseClientIdDocument(clientDocument(), CLIENT_ID);
    expect(parsed).toEqual({ clientId: CLIENT_ID, redirectUris: [REDIRECT_URI], clientName: "Test app" });
  });

  it("requires the Solid-OIDC JSON-LD context", () => {
    expect(() => parseClientIdDocument(clientDocument({ "@context": "https://schema.org" }), CLIENT_ID)).toThrow(
      /Solid-OIDC JSON-LD context/,
    );
  });

  it("requires client_id to equal the document URL", () => {
    expect(() => parseClientIdDocument(clientDocument({ client_id: "https://app.example/other" }), CLIENT_ID)).toThrow(
      /must be identical to the document URL/,
    );
  });

  it("requires a non-empty redirect_uris array", () => {
    expect(() => parseClientIdDocument(clientDocument({ redirect_uris: [] }), CLIENT_ID)).toThrow(/redirect_uris/);
  });

  it("rejects non-absolute and insecure redirect URIs", () => {
    expect(() => parseClientIdDocument(clientDocument({ redirect_uris: ["/callback"] }), CLIENT_ID)).toThrow(
      /not an absolute URL/,
    );
    expect(() =>
      parseClientIdDocument(clientDocument({ redirect_uris: ["http://app.example/callback"] }), CLIENT_ID),
    ).toThrow(/does not use https/);
  });

  it("rejects documents that are not JSON objects", () => {
    expect(() => parseClientIdDocument([], CLIENT_ID)).toThrow(SebaDiscoveryError);
  });
});

describe("loadClientIdDocument", () => {
  it("fetches the document and returns the parsed value", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(clientDocument()), { status: 200, headers: { "content-type": "application/ld+json" } }),
    );
    const document = await loadClientIdDocument(CLIENT_ID, fetchImpl);
    expect(document.clientId).toBe(CLIENT_ID);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(CLIENT_ID);
  });

  it("reports a missing document", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 404 }));
    await expect(loadClientIdDocument(CLIENT_ID, fetchImpl)).rejects.toThrow(/HTTP 404/);
  });
});

describe("assertRedirectUriPublished", () => {
  const document = { clientId: CLIENT_ID, redirectUris: [REDIRECT_URI] };

  it("accepts an exact match", () => {
    expect(() => assertRedirectUriPublished(document, REDIRECT_URI)).not.toThrow();
  });

  it("rejects a trailing-slash difference and lists the published URIs", () => {
    try {
      assertRedirectUriPublished(document, `${REDIRECT_URI}/`);
      expect.unreachable("expected a redirect mismatch");
    } catch (error) {
      expect(error).toBeInstanceOf(SebaRedirectMismatchError);
      const mismatch = error as SebaRedirectMismatchError;
      expect(mismatch.requestedRedirectUri).toBe(`${REDIRECT_URI}/`);
      expect(mismatch.publishedRedirectUris).toEqual([REDIRECT_URI]);
      expect(mismatch.code).toBe("SEBA_ERR_REDIRECT_MISMATCH");
    }
  });
});

describe("validateWebId", () => {
  it("splits a WebID into identity and profile document", () => {
    expect(validateWebId("https://alice.example/profile/card#me")).toEqual({
      webId: "https://alice.example/profile/card#me",
      documentUrl: "https://alice.example/profile/card",
    });
  });

  it("accepts a WebID without a fragment", () => {
    expect(validateWebId("https://alice.example/profile/card").documentUrl).toBe("https://alice.example/profile/card");
  });

  it("rejects insecure, relative and credentialed WebIDs", () => {
    expect(() => validateWebId("http://alice.example/card#me")).toThrow(SebaConfigError);
    expect(() => validateWebId("card#me")).toThrow(SebaConfigError);
    expect(() => validateWebId("https://user:pass@alice.example/card#me")).toThrow(SebaConfigError);
  });
});

describe("parseTurtle", () => {
  const profile = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
# the agent
<#me> a foaf:Person ;
  solid:oidcIssuer <https://idp.example> ;
  foaf:name "Alice"@en, "Ali" .
`;

  it("parses prefixes, a, lists, comments, language tags and relative IRIs", () => {
    const triples = parseTurtle(profile, "https://alice.example/card");
    expect(triples).toHaveLength(4);
    expect(triples[0]).toMatchObject({
      subject: "https://alice.example/card#me",
      predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      object: { value: "http://xmlns.com/foaf/0.1/Person" },
    });
    expect(extractIssuerStatements(triples)).toEqual([
      { subject: "https://alice.example/card#me", issuer: "https://idp.example" },
    ]);
    expect(triples.map((triple) => (triple.object.type === "literal" ? triple.object.value : ""))).toContain(
      "Alice@en",
    );
  });

  it("supports SPARQL-style directives, base and blank nodes", () => {
    const triples = parseTurtle(
      'PREFIX solid: <http://www.w3.org/ns/solid/terms#>\nBASE <https://alice.example/card>\n[] solid:oidcIssuer <https://idp.example> .',
      "https://alice.example/card",
    );
    expect(triples[0]?.subject).toMatch(/^_:b/);
  });

  it("rejects unsupported constructs with a positional message", () => {
    expect(() =>
      parseTurtle(
        "@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n<#me> solid:oidcIssuer (1 2) .",
        "https://a.example/card",
      ),
    ).toThrow(/collections/);
    expect(() => parseTurtle("<#me> solid:oidcIssuer <https://idp.example> .", "https://a.example/card")).toThrow(
      /Unknown Turtle prefix/,
    );
  });

  it("rejects unterminated strings", () => {
    expect(() => parseTurtle('@prefix f: <http://x/>.\n<#me> f:n "oops .', "https://a.example/card")).toThrow(
      /Unterminated string/,
    );
  });
});

describe("extractJsonLdIssuers", () => {
  it("reads expanded and compacted predicates, including @graph", () => {
    const statements = extractJsonLdIssuers(
      {
        "@graph": [
          { "@id": "#me", solid: { oidcIssuer: { "@id": "https://bad.example" } } },
          { "@id": "#me", "solid:oidcIssuer": { "@id": "https://idp.example" } },
        ],
      },
      "https://alice.example/card",
    );
    expect(statements).toEqual([{ subject: "https://alice.example/card#me", issuer: "https://idp.example" }]);
  });
});

describe("parseLinkHeader", () => {
  it("matches a relation among several link values", () => {
    const header = `<https://alice.example/card>; rel="alternate", <https://idp.example>; rel="${OIDC_ISSUER_PREDICATE}"`;
    expect(parseLinkHeader(header, OIDC_ISSUER_PREDICATE)).toEqual(["https://idp.example"]);
    expect(parseLinkHeader(null, OIDC_ISSUER_PREDICATE)).toEqual([]);
  });
});

describe("discoverIssuerForWebId", () => {
  const webId = "https://alice.example/card#me";

  it("reads the issuer from a Turtle profile", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      turtleResponse(
        '@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n<#me> solid:oidcIssuer <https://idp.example> .',
      ),
    );
    await expect(discoverIssuerForWebId(webId, fetchImpl)).resolves.toBe("https://idp.example");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("https://alice.example/card");
  });

  it("reads the issuer from a JSON-LD profile", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      turtleResponse(
        JSON.stringify({ "@id": "#me", "solid:oidcIssuer": { "@id": "https://idp.example" } }),
        "application/ld+json",
      ),
    );
    await expect(discoverIssuerForWebId(webId, fetchImpl)).resolves.toBe("https://idp.example");
  });

  it("falls back to the Link header for HTML profiles", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
          link: `<https://idp.example>; rel="${OIDC_ISSUER_PREDICATE}"`,
        },
      }),
    );
    await expect(discoverIssuerForWebId(webId, fetchImpl)).resolves.toBe("https://idp.example");
  });

  it("fails closed when the profile does not name the WebID", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      turtleResponse(
        '@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n<#someone-else> solid:oidcIssuer <https://idp.example> .',
      ),
    );
    await expect(discoverIssuerForWebId(webId, fetchImpl)).rejects.toThrow(/does not state/);
  });

  it("rejects an insecure issuer declared by the profile", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      turtleResponse(
        '@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n<#me> solid:oidcIssuer <http://idp.example> .',
      ),
    );
    await expect(discoverIssuerForWebId(webId, fetchImpl)).rejects.toThrow(/must use https/);
  });
});

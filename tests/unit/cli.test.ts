import { describe, expect, it } from "vitest";

import {
  ClientIdInputError,
  buildClientIdDocument,
  parseCliArgs,
  runCli,
} from "../../src/cli.js";

describe("seba client-id", () => {
  it("builds a spec-shaped Client ID Document", () => {
    const document = buildClientIdDocument({
      clientId: "https://app.example/client-id.jsonld",
      redirectUris: ["https://app.example/auth/callback"],
      clientName: "My Solid app",
    });
    expect(document).toEqual({
      "@context": ["https://www.w3.org/ns/solid/oidc-context.jsonld"],
      client_id: "https://app.example/client-id.jsonld",
      client_name: "My Solid app",
      redirect_uris: ["https://app.example/auth/callback"],
      scope: "openid webid offline_access",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  });

  it("accepts loopback http callbacks but rejects public http", () => {
    expect(() =>
      buildClientIdDocument({
        clientId: "http://localhost:3000/client-id.jsonld",
        redirectUris: ["http://127.0.0.1:3000/callback"],
      }),
    ).not.toThrow();
    expect(() =>
      buildClientIdDocument({
        clientId: "http://app.example/client-id.jsonld",
        redirectUris: ["https://app.example/callback"],
      }),
    ).toThrow(ClientIdInputError);
    expect(() =>
      buildClientIdDocument({
        clientId: "https://app.example/client-id.jsonld",
        redirectUris: ["https://app.example/callback#fragment"],
      }),
    ).toThrow(/fragment/);
  });

  it("requires at least one redirect URI", () => {
    expect(() =>
      buildClientIdDocument({
        clientId: "https://app.example/client-id.jsonld",
        redirectUris: [],
      }),
    ).toThrow(/redirect-uri/);
  });

  it("parses repeated flags and writes to stdout", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(
      [
        "client-id",
        "--client-id",
        "https://app.example/client-id.jsonld",
        "--redirect-uri",
        "https://app.example/callback",
        "--redirect-uri",
        "https://app.example/second",
      ],
      { stdout: (text) => out.push(text), stderr: (text) => err.push(text) },
    );
    expect(code).toBe(0);
    expect(JSON.parse(out.join("")).redirect_uris).toHaveLength(2);
    expect(err.join("")).toContain("application/ld+json");
  });

  it("writes the document when --out is given", async () => {
    const written: { path: string; contents: string }[] = [];
    const code = await runCli(
      [
        "client-id",
        "--client-id",
        "https://app.example/client-id.jsonld",
        "--redirect-uri",
        "https://app.example/callback",
        "--out",
        "public/client-id.jsonld",
      ],
      {
        stdout: () => undefined,
        stderr: () => undefined,
        writeFile: async (path, contents) => {
          written.push({ path, contents });
        },
      },
    );
    expect(code).toBe(0);
    expect(written[0]?.path).toBe("public/client-id.jsonld");
    expect(JSON.parse(written[0]?.contents ?? "")).toMatchObject({
      client_id: "https://app.example/client-id.jsonld",
    });
  });

  it("reports usage errors with exit code 1", async () => {
    const err: string[] = [];
    expect(await runCli(["client-id"], { stdout: () => undefined, stderr: (t) => err.push(t) })).toBe(1);
    expect(err.join("")).toContain("--client-id is required");
    expect(await runCli(["nope"], { stdout: () => undefined, stderr: () => undefined })).toBe(1);
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
    expect(() => parseCliArgs(["client-id", "--client-id"])).toThrow(/Missing value/);
  });
});

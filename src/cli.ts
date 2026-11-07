#!/usr/bin/env node
/**
 * `seba` command line.
 *
 * Today it has one job: print (or write) a Solid-OIDC Client ID Document that the
 * provider can dereference, so setting up an application does not require copying
 * JSON-LD from the specification by hand.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CONTEXT = "https://www.w3.org/ns/solid/oidc-context.jsonld";

/** A generated Client ID Document (OIDC client registration metadata). */
export interface ClientIdDocument {
  "@context": [string];
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  client_uri?: string;
  logo_uri?: string;
  scope: string;
  grant_types: string[];
  response_types: string[];
}

/** Input accepted by {@link buildClientIdDocument}. */
export interface ClientIdInput {
  /** Public URL the document will be served from; also the OAuth `client_id`. */
  clientId: string;
  /** One or more exact callback URLs. */
  redirectUris: string[];
  /** Human readable application name shown on the consent screen. */
  clientName?: string;
  /** Homepage of the application. */
  clientUri?: string;
  /** Absolute URL of the application logo. */
  logoUri?: string;
  /** Requested scopes. Defaults to `openid webid offline_access`. */
  scope?: string;
}

/** Raised for unusable command line input. */
export class ClientIdInputError extends Error {}

const USAGE = `SEBA — Solid-OIDC client helper

Usage:
  seba client-id --client-id <url> --redirect-uri <url> [options]

Options:
  --client-id <url>       Public URL the document is served from (required).
  --redirect-uri <url>    Exact callback URL; repeat for more than one (required).
  --client-name <name>    Name shown on the provider consent screen.
  --client-uri <url>      Application homepage.
  --logo-uri <url>        Absolute URL of the application logo.
  --scope <scopes>        Defaults to "openid webid offline_access".
  --out <file>            Write the document to a file instead of stdout.
  -h, --help              Show this help.

The document must be served as application/ld+json at --client-id, and every
--redirect-uri must appear in it verbatim.
`;

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function requireAbsoluteUrl(value: string, label: string, allowFragment = true): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ClientIdInputError(`${label} must be an absolute URL (got "${value}").`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new ClientIdInputError(
      `${label} must use https (plain http is allowed only for localhost/loopback development).`,
    );
  }
  if (!allowFragment && url.hash !== "") {
    throw new ClientIdInputError(`${label} must not contain a fragment ("#...").`);
  }
  return url;
}

/**
 * Build the JSON-LD Client ID Document for an application.
 *
 * @throws {@link ClientIdInputError} for unusable URLs or an empty redirect list.
 */
export function buildClientIdDocument(input: ClientIdInput): ClientIdDocument {
  const clientId = requireAbsoluteUrl(input.clientId, "--client-id").href;
  const redirectUris = input.redirectUris.map(
    (uri) => requireAbsoluteUrl(uri, "--redirect-uri", false).href,
  );
  if (redirectUris.length === 0) {
    throw new ClientIdInputError("At least one --redirect-uri is required.");
  }
  const document: ClientIdDocument = {
    "@context": [CONTEXT],
    client_id: clientId,
    ...(input.clientName === undefined ? {} : { client_name: input.clientName }),
    redirect_uris: redirectUris,
    ...(input.clientUri === undefined
      ? {}
      : { client_uri: requireAbsoluteUrl(input.clientUri, "--client-uri").href }),
    ...(input.logoUri === undefined
      ? {}
      : { logo_uri: requireAbsoluteUrl(input.logoUri, "--logo-uri").href }),
    scope: input.scope ?? "openid webid offline_access",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
  return document;
}

/** Parsed command line. */
export type CliCommand =
  | { kind: "help" }
  | { kind: "client-id"; input: ClientIdInput; out: string | null };

/** Parse process arguments (without `node` and the script path). */
export function parseCliArgs(argv: readonly string[]): CliCommand {
  const [command, ...rest] = argv;
  if (command === undefined || command === "-h" || command === "--help" || command === "help") {
    return { kind: "help" };
  }
  if (command !== "client-id") {
    throw new ClientIdInputError(`Unknown command "${command}". Try: seba client-id --help`);
  }

  let clientId: string | undefined;
  let clientName: string | undefined;
  let clientUri: string | undefined;
  let logoUri: string | undefined;
  let scope: string | undefined;
  let out: string | null = null;
  const redirectUris: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === "-h" || flag === "--help") {
      return { kind: "help" };
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new ClientIdInputError(`Missing value for "${String(flag)}".`);
    }
    index += 1;
    switch (flag) {
      case "--client-id":
        clientId = value;
        break;
      case "--redirect-uri":
        redirectUris.push(value);
        break;
      case "--client-name":
        clientName = value;
        break;
      case "--client-uri":
        clientUri = value;
        break;
      case "--logo-uri":
        logoUri = value;
        break;
      case "--scope":
        scope = value;
        break;
      case "--out":
        out = value;
        break;
      default:
        throw new ClientIdInputError(`Unknown option "${String(flag)}". Try: seba client-id --help`);
    }
  }

  if (clientId === undefined) {
    throw new ClientIdInputError("--client-id is required.");
  }
  return {
    kind: "client-id",
    input: {
      clientId,
      redirectUris,
      ...(clientName === undefined ? {} : { clientName }),
      ...(clientUri === undefined ? {} : { clientUri }),
      ...(logoUri === undefined ? {} : { logoUri }),
      ...(scope === undefined ? {} : { scope }),
    },
    out,
  };
}

/** Run the CLI and return the process exit code. */
export async function runCli(
  argv: readonly string[],
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    writeFile?: (path: string, contents: string) => Promise<void>;
  },
): Promise<number> {
  let command: CliCommand;
  try {
    command = parseCliArgs(argv);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  if (command.kind === "help") {
    io.stdout(USAGE);
    return 0;
  }

  let document: ClientIdDocument;
  try {
    document = buildClientIdDocument(command.input);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const json = `${JSON.stringify(document, null, 2)}\n`;

  if (command.out !== null) {
    if (io.writeFile === undefined) {
      io.stderr("Writing files is not available in this environment.\n");
      return 1;
    }
    try {
      await io.writeFile(command.out, json);
    } catch (error) {
      io.stderr(`Could not write ${command.out}: ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    io.stderr(
      `Wrote ${command.out}.\n` +
        `Serve it as application/ld+json at ${document.client_id}, and keep ${document.redirect_uris.join(", ")} published verbatim.\n`,
    );
    return 0;
  }

  io.stdout(json);
  io.stderr(`Serve this document as application/ld+json at ${document.client_id}.\n`);
  return 0;
}

async function main(): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const code = await runCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    writeFile: async (path, contents) => {
      const directory = dirname(path);
      if (directory !== "." && directory !== "") {
        await mkdir(directory, { recursive: true });
      }
      await writeFile(path, contents, "utf8");
    },
  });
  process.exitCode = code;
}

/** Whether this module is the process entry point (not merely imported). */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  void main();
}

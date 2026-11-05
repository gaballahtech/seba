/**
 * Client identification and WebID-based issuer discovery.
 *
 * SEBA uses a static Solid Client ID Document as its `client_id`: the URL of the
 * document *is* the client identifier. No dynamic client registration is performed and
 * `registration_endpoint` is never called.
 *
 * WebID profiles are read as Turtle (documented subset), JSON-LD or, as a last resort,
 * an HTML `Link` header. The parsed issuer is then validated as an issuer URL before it
 * is trusted.
 */

import { SebaConfigError, SebaDiscoveryError, SebaRedirectMismatchError } from "./errors.js";
import { isLoopbackHost, validateIssuerUrl } from "./discovery.js";
import { httpFetch, isOk, parseJson, readText } from "./http.js";
import type { ClientIDDocument } from "../types.js";

/** JSON-LD context every Solid Client ID Document must declare. */
export const SOLID_OIDC_CONTEXT = "https://www.w3.org/ns/solid/oidc-context.jsonld";

/** Solid terms namespace. */
const SOLID_TERMS = "http://www.w3.org/ns/solid/terms#";

/** Fully expanded predicate of `solid:oidcIssuer`. */
export const OIDC_ISSUER_PREDICATE = `${SOLID_TERMS}oidcIssuer`;

/** Predicate accepted in compacted JSON-LD documents. */
const COMPACT_ISSUER_PREDICATE = "solid:oidcIssuer";

/** Result of validating a WebID: the normalized WebID and its profile URL. */
export interface WebIdLocation {
  /** Normalized WebID (absolute IRI, fragment preserved). */
  readonly webId: string;
  /** Profile document URL (the WebID without its fragment). */
  readonly documentUrl: string;
}

/** A `(subject, solid:oidcIssuer, issuer)` statement extracted from a profile. */
export interface IssuerStatement {
  readonly subject: string;
  readonly issuer: string;
}

/** An RDF term parsed from Turtle. */
type Term =
  | { readonly type: "iri"; readonly value: string }
  | { readonly type: "literal"; readonly value: string }
  | { readonly type: "bnode"; readonly id: string };

/** A parsed Turtle triple. */
export interface Triple {
  readonly subject: string;
  readonly predicate: string;
  readonly object: Term;
}

/**
 * Validate and normalize a WebID.
 *
 * @param webId - WebID supplied by the application or the user.
 * @throws {@link SebaConfigError} when the value is not an absolute https (or loopback
 *   http) IRI without embedded credentials.
 */
export function validateWebId(webId: string): WebIdLocation {
  let url: URL;
  try {
    url = new URL(webId);
  } catch {
    throw new SebaConfigError(
      `The WebID "${webId}" is not an absolute URL. A WebID looks like "https://alice.example/profile/card#me".`,
    );
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new SebaConfigError(
      `The WebID "${webId}" must use https. Plain http is only accepted for loopback development hosts.`,
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new SebaConfigError(`The WebID "${webId}" must not contain embedded credentials.`);
  }
  const normalized = url.href;
  const document = new URL(normalized);
  document.hash = "";
  return { webId: normalized, documentUrl: document.href };
}

/**
 * Validate a Client ID Document URL taken from configuration.
 *
 * @param clientId - Configured `client_id`.
 * @throws {@link SebaConfigError} when the value cannot be a Client ID Document URL.
 */
export function validateClientIdUrl(clientId: string): string {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new SebaConfigError(
      `The clientId "${clientId}" is not an absolute URL. ` +
        'Use the HTTPS URL of your published Client ID Document, for example "https://app.example/client-id.jsonld".',
    );
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new SebaConfigError(
      `The clientId "${clientId}" must be served over https. ` +
        "A Client ID Document is a public identity document; plain http is only accepted for loopback development hosts.",
    );
  }
  if (url.hash !== "") {
    throw new SebaConfigError(`The clientId "${clientId}" must not contain a fragment.`);
  }
  return clientId;
}

/**
 * Parse and validate a Solid Client ID Document.
 *
 * @param raw - Parsed JSON body.
 * @param documentUrl - URL the document was fetched from; `client_id` must equal it.
 * @throws {@link SebaDiscoveryError} when the document is not a valid Client ID Document.
 */
export function parseClientIdDocument(raw: unknown, documentUrl: string): ClientIDDocument {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SebaDiscoveryError(`The Client ID Document at "${documentUrl}" is not a JSON object.`);
  }
  const document = raw as Record<string, unknown>;

  const context = document["@context"];
  const contexts = Array.isArray(context) ? context : [context];
  if (!contexts.includes(SOLID_OIDC_CONTEXT)) {
    throw new SebaDiscoveryError(
      `The Client ID Document at "${documentUrl}" does not declare the Solid-OIDC JSON-LD context. ` +
        `Add "@context": ["${SOLID_OIDC_CONTEXT}"] to the document.`,
    );
  }

  if (typeof document["client_id"] !== "string" || document["client_id"] !== documentUrl) {
    const declared = typeof document["client_id"] === "string" ? document["client_id"] : "(missing)";
    throw new SebaDiscoveryError(
      `The Client ID Document at "${documentUrl}" declares client_id "${declared}". ` +
        `The client_id member must be identical to the document URL "${documentUrl}".`,
    );
  }

  const redirectUris = document["redirect_uris"];
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    throw new SebaDiscoveryError(
      `The Client ID Document at "${documentUrl}" does not publish a non-empty redirect_uris array. ` +
        'Add every callback URL you use, for example "redirect_uris": ["https://app.example/auth/callback"].',
    );
  }
  for (const uri of redirectUris) {
    if (typeof uri !== "string") {
      throw new SebaDiscoveryError(`The Client ID Document at "${documentUrl}" contains a non-string redirect URI.`);
    }
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new SebaDiscoveryError(
        `The Client ID Document at "${documentUrl}" publishes the redirect URI "${uri}", which is not an absolute URL.`,
      );
    }
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopbackHost(parsed.hostname))) {
      throw new SebaDiscoveryError(
        `The Client ID Document at "${documentUrl}" publishes the redirect URI "${uri}", which does not use https. ` +
          "Only loopback http redirect URIs are accepted for development.",
      );
    }
    if (parsed.hash !== "") {
      throw new SebaDiscoveryError(
        `The Client ID Document at "${documentUrl}" publishes the redirect URI "${uri}", which contains a fragment.`,
      );
    }
  }

  const result: ClientIDDocument = {
    clientId: documentUrl,
    redirectUris: redirectUris as string[],
  };
  if (typeof document["client_name"] === "string") {
    result.clientName = document["client_name"];
  }
  return result;
}

/**
 * Fetch and validate the Client ID Document.
 *
 * @param clientId - Configured Client ID Document URL.
 * @param fetchImpl - Runtime `fetch` implementation.
 */
export async function loadClientIdDocument(clientId: string, fetchImpl: typeof fetch): Promise<ClientIDDocument> {
  const url = validateClientIdUrl(clientId);
  const response = await httpFetch(
    url,
    { headers: { accept: "application/ld+json, application/json;q=0.9" }, redirect: "follow" },
    { fetchImpl },
  );
  if (!isOk(response)) {
    throw new SebaDiscoveryError(
      `Fetching the Client ID Document at "${url}" failed with HTTP ${String(response.status)}. ` +
        "The document must be publicly dereferenceable without authentication.",
    );
  }
  const text = await readText(response, "Client ID Document");
  const raw = parseJson<unknown>(text, `The Client ID Document at "${url}"`);
  return parseClientIdDocument(raw, url);
}

/**
 * Assert that a redirect URI is published verbatim by the Client ID Document.
 *
 * Membership is compared as exact strings: no normalization is applied to either side.
 *
 * @param document - Validated Client ID Document.
 * @param redirectUri - Configured redirect URI.
 * @throws {@link SebaRedirectMismatchError} when the URI is not published.
 */
export function assertRedirectUriPublished(document: ClientIDDocument, redirectUri: string): void {
  if (!document.redirectUris.includes(redirectUri)) {
    throw new SebaRedirectMismatchError(redirectUri, document.redirectUris);
  }
}

/**
 * Parse a Turtle document and return its triples.
 *
 * Supported subset: `@prefix`/`PREFIX`, `@base`/`BASE`, IRIs (relative IRIs resolve
 * against the base), prefixed names, `a` as `rdf:type`, subject/predicate/object lists
 * with `;` and `,`, comments, blank node labels, empty `[]` blank nodes, and literals with
 * language tags or datatypes. Collections `( … )` and property lists `[ … ]` are rejected
 * with a descriptive error instead of being mis-parsed.
 *
 * @param text - Turtle source.
 * @param baseUrl - Base IRI for relative references (the document URL).
 */
export function parseTurtle(text: string, baseUrl: string): Triple[] {
  return new TurtleParser(text, baseUrl).parse();
}

class TurtleParser {
  private index = 0;
  private base: string;
  private readonly prefixes = new Map<string, string>();
  private readonly triples: Triple[] = [];
  private blankCounter = 0;

  constructor(
    private readonly text: string,
    baseUrl: string,
  ) {
    this.base = baseUrl;
  }

  parse(): Triple[] {
    while (true) {
      this.skipWhitespace();
      if (this.atEnd()) {
        break;
      }
      if (this.peek() === "@") {
        this.parseDirective();
        continue;
      }
      const keyword = this.peekWord();
      if (keyword !== null && (keyword.toLowerCase() === "prefix" || keyword.toLowerCase() === "base")) {
        this.parseDirective(true);
        continue;
      }
      this.parseTriples();
    }
    return this.triples;
  }

  private parseDirective(sparqlStyle = false): void {
    if (!sparqlStyle) {
      this.expect("@");
    }
    const name = this.readWord().toLowerCase();
    if (name !== "prefix" && name !== "base") {
      throw this.error(`Unsupported Turtle directive "@${name}".`);
    }
    this.skipWhitespace();
    if (name === "prefix") {
      const prefix = this.readPrefixLabel();
      this.expect(":");
      this.skipWhitespace();
      const iri = this.readIri();
      this.prefixes.set(prefix, iri);
    } else {
      this.base = this.readIri();
    }
    this.skipWhitespace();
    if (!sparqlStyle) {
      this.expect(".");
    }
  }

  private parseTriples(): void {
    const subject = this.parseSubject();
    this.parsePredicateObjectList(subject);
    this.skipWhitespace();
    this.expect(".");
  }

  private parsePredicateObjectList(subject: string): void {
    while (true) {
      this.skipWhitespace();
      const predicate = this.parsePredicate();
      while (true) {
        this.skipWhitespace();
        const object = this.parseObject();
        this.triples.push({ subject, predicate, object });
        this.skipWhitespace();
        if (this.peek() === ",") {
          this.index += 1;
          continue;
        }
        break;
      }
      this.skipWhitespace();
      if (this.peek() === ";") {
        this.index += 1;
        this.skipWhitespace();
        if (this.peek() === ".") {
          return;
        }
        continue;
      }
      return;
    }
  }

  private parseSubject(): string {
    this.skipWhitespace();
    const char = this.peek();
    if (char === "[") {
      this.index += 1;
      this.skipWhitespace();
      if (this.peek() !== "]") {
        throw this.error(
          "Property lists as subjects (\"[ … ]\") are not supported by SEBA's Turtle subset. " +
            "Rewrite the profile using a labelled blank node or plain triples.",
        );
      }
      this.index += 1;
      return this.newBlankNode();
    }
    if (char === "(") {
      throw this.error("RDF collections (\"( … )\") are not supported by SEBA's Turtle subset.");
    }
    if (char === "_" && this.text[this.index + 1] === ":") {
      return this.readBlankNodeLabel();
    }
    return this.readIriOrPrefixedName();
  }

  private parsePredicate(): string {
    this.skipWhitespace();
    if (this.peekWord() === "a") {
      this.readWord();
      return "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    }
    return this.readIriOrPrefixedName();
  }

  private parseObject(): Term {
    this.skipWhitespace();
    const char = this.peek();
    if (char === '"' || char === "'") {
      return this.readLiteral();
    }
    if (char === "[") {
      this.index += 1;
      this.skipWhitespace();
      if (this.peek() !== "]") {
        throw this.error(
          "Nested property lists (\"[ … ]\" as an object) are not supported by SEBA's Turtle subset. " +
            "Write the nested triples separately.",
        );
      }
      this.index += 1;
      return { type: "bnode", id: this.newBlankNode() };
    }
    if (char === "(") {
      throw this.error("RDF collections (\"( … )\") are not supported by SEBA's Turtle subset.");
    }
    const word = this.peekWord();
    if (word === "true" || word === "false") {
      this.readWord();
      return { type: "literal", value: word };
    }
    if (word === null && (char === "-" || char === "+" || (char !== undefined && /\d/.test(char)))) {
      return { type: "literal", value: this.readNumber() };
    }
    if (char === "_" && this.text[this.index + 1] === ":") {
      return { type: "bnode", id: this.readBlankNodeLabel() };
    }
    const iri = this.readIriOrPrefixedName();
    return { type: "iri", value: iri };
  }

  private readLiteral(): Term {
    const value = this.readStringLiteral();
    if (this.peek() === "@") {
      this.index += 1;
      const language = this.readLanguageTag();
      return { type: "literal", value: `${value}@${language}` };
    }
    if (this.text.startsWith("^^", this.index)) {
      this.index += 2;
      const datatype = this.readIriOrPrefixedName();
      return { type: "literal", value: datatype === "http://www.w3.org/2001/XMLSchema#string" ? value : `${value}^^${datatype}` };
    }
    return { type: "literal", value };
  }

  private readStringLiteral(): string {
    const quote = this.peek();
    if (quote !== '"' && quote !== "'") {
      throw this.error("Expected a string literal.");
    }
    const tripleQuoted = this.text.startsWith(String(quote).repeat(3), this.index);
    this.index += tripleQuoted ? 3 : 1;
    let result = "";
    while (!this.atEnd()) {
      if (tripleQuoted && this.text.startsWith(String(quote).repeat(3), this.index)) {
        this.index += 3;
        return result;
      }
      const char = this.text[this.index] as string;
      this.index += 1;
      if (!tripleQuoted && char === quote) {
        return result;
      }
      if (!tripleQuoted && (char === "\n" || char === "\r")) {
        throw this.error("Unterminated string literal.");
      }
      if (char === "\\") {
        result += this.readEscape();
        continue;
      }
      result += char;
    }
    throw this.error("Unterminated string literal.");
  }

  private readEscape(): string {
    const char = this.text[this.index];
    this.index += 1;
    switch (char) {
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "f":
        return "\f";
      case '"':
        return '"';
      case "'":
        return "'";
      case "\\":
        return "\\";
      case "u":
        return this.readUnicodeEscape(4);
      case "U":
        return this.readUnicodeEscape(8);
      default:
        throw this.error(`Unsupported escape sequence "\\${String(char)}" in Turtle input.`);
    }
  }

  private readUnicodeEscape(length: number): string {
    const hex = this.text.slice(this.index, this.index + length);
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== length) {
      throw this.error("Invalid unicode escape in Turtle input.");
    }
    this.index += length;
    return String.fromCodePoint(Number.parseInt(hex, 16));
  }

  private readIriOrPrefixedName(): string {
    this.skipWhitespace();
    if (this.peek() === "<") {
      return this.readIri();
    }
    const start = this.index;
    const prefix = this.readPrefixLabel();
    if (this.peek() !== ":") {
      this.index = start;
      throw this.error("Expected an IRI or a prefixed name.");
    }
    this.index += 1;
    const local = this.readLocalName();
    const namespace = this.prefixes.get(prefix);
    if (namespace === undefined) {
      throw this.error(
        `Unknown Turtle prefix "${prefix}:". Declare it with "@prefix ${prefix}: <…> ." before use.`,
      );
    }
    return `${namespace}${local}`;
  }

  private readPrefixLabel(): string {
    const match = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(this.text.slice(this.index));
    if (match === null) {
      return "";
    }
    this.index += match[0].length;
    return match[0];
  }

  private readLocalName(): string {
    const match = /^[A-Za-z0-9_.%~-]*/.exec(this.text.slice(this.index));
    let local = match?.[0] ?? "";
    if (local.endsWith(".")) {
      local = local.slice(0, -1);
    }
    this.index += local.length;
    return local;
  }

  private readIri(): string {
    this.skipWhitespace();
    this.expect("<");
    let value = "";
    while (!this.atEnd()) {
      const char = this.text[this.index] as string;
      this.index += 1;
      if (char === ">") {
        const resolved = resolveAbsoluteIri(value, this.base);
        if (resolved === null) {
          throw this.error(`The IRI "<${value}>" cannot be resolved against "${this.base}".`);
        }
        return resolved;
      }
      if (char === "\\") {
        value += this.readEscape();
        continue;
      }
      if (char === "<" || char === '"' || char === "{" || char === "}" || char === "|" || char === "^") {
        throw this.error(`The IRI "<${value}${char}" contains an illegal character.`);
      }
      value += char;
    }
    throw this.error("Unterminated IRI.");
  }

  private readBlankNodeLabel(): string {
    this.expect("_");
    this.expect(":");
    const match = /^[A-Za-z0-9_][A-Za-z0-9_.-]*/.exec(this.text.slice(this.index));
    if (match === null) {
      throw this.error("Expected a blank node label after \"_:\".");
    }
    this.index += match[0].length;
    return `_:${match[0]}`;
  }

  private readNumber(): string {
    const match = /^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?/.exec(this.text.slice(this.index));
    if (match === null) {
      throw this.error("Invalid numeric literal in Turtle input.");
    }
    this.index += match[0].length;
    return match[0];
  }

  private readLanguageTag(): string {
    const match = /^[A-Za-z]+(-[A-Za-z0-9]+)*/.exec(this.text.slice(this.index));
    if (match === null) {
      throw this.error("Invalid language tag in Turtle input.");
    }
    this.index += match[0].length;
    return match[0];
  }

  private readWord(): string {
    const match = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(this.text.slice(this.index));
    if (match === null) {
      return "";
    }
    this.index += match[0].length;
    return match[0];
  }

  private peekWord(): string | null {
    const match = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(this.text.slice(this.index));
    return match?.[0] ?? null;
  }

  private newBlankNode(): string {
    this.blankCounter += 1;
    return `_:b${String(this.blankCounter)}`;
  }

  private skipWhitespace(): void {
    while (!this.atEnd()) {
      const char = this.text[this.index] as string;
      if (char === "\uFEFF" || /\s/.test(char)) {
        this.index += 1;
        continue;
      }
      if (char === "#") {
        while (!this.atEnd() && this.text[this.index] !== "\n") {
          this.index += 1;
        }
        continue;
      }
      return;
    }
  }

  private expect(value: string): void {
    if (!this.text.startsWith(value, this.index)) {
      throw this.error(`Expected "${value}".`);
    }
    this.index += value.length;
  }

  private peek(): string | undefined {
    return this.text[this.index];
  }

  private atEnd(): boolean {
    return this.index >= this.text.length;
  }

  private error(message: string): SebaDiscoveryError {
    const upTo = this.text.slice(0, this.index);
    const line = upTo.split("\n").length;
    const column = this.index - upTo.lastIndexOf("\n");
    return new SebaDiscoveryError(
      `Unable to parse the Turtle document at line ${String(line)}, column ${String(column)}: ${message}`,
    );
  }
}

/**
 * Extract `solid:oidcIssuer` statements from parsed triples.
 *
 * @param triples - Parsed triples.
 */
export function extractIssuerStatements(triples: readonly Triple[]): IssuerStatement[] {
  const statements: IssuerStatement[] = [];
  for (const triple of triples) {
    if (triple.predicate === OIDC_ISSUER_PREDICATE && triple.object.type === "iri") {
      statements.push({ subject: triple.subject, issuer: triple.object.value });
    }
  }
  return statements;
}

/**
 * Extract `solid:oidcIssuer` statements from a JSON-LD document.
 *
 * Accepts the expanded predicate and the compacted `solid:oidcIssuer` form, string or
 * `{ "@id": … }` values, and nested `@graph` containers.
 *
 * @param raw - Parsed JSON-LD document.
 * @param documentUrl - Base URL for relative `@id` values.
 */
export function extractJsonLdIssuers(raw: unknown, documentUrl: string): IssuerStatement[] {
  const statements: IssuerStatement[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const entry of node) {
        visit(entry);
      }
      return;
    }
    if (typeof node !== "object" || node === null) {
      return;
    }
    const record = node as Record<string, unknown>;
    if (Array.isArray(record["@graph"])) {
      visit(record["@graph"]);
    }
    const rawSubject = typeof record["@id"] === "string" ? record["@id"] : null;
    if (rawSubject === null) {
      return;
    }
    let subject: string;
    try {
      subject = new URL(rawSubject, documentUrl).href;
    } catch {
      return;
    }
    for (const key of [OIDC_ISSUER_PREDICATE, COMPACT_ISSUER_PREDICATE]) {
      const value = record[key];
      if (value === undefined) {
        continue;
      }
      for (const entry of Array.isArray(value) ? value : [value]) {
        if (typeof entry === "string") {
          statements.push({ subject, issuer: resolveIri(entry, documentUrl) });
        } else if (typeof entry === "object" && entry !== null) {
          const id = (entry as Record<string, unknown>)["@id"];
          if (typeof id === "string") {
            statements.push({ subject, issuer: resolveIri(id, documentUrl) });
          }
        }
      }
    }
  };
  visit(raw);
  return statements;
}

/**
 * Resolve an IRI against a base while preserving already-absolute IRIs byte for byte.
 *
 * `new URL("https://idp.example").href` appends a trailing slash, which would silently
 * change an issuer identifier. Responding issuer identifiers are compared exactly, so
 * absolute IRIs are returned unchanged.
 *
 * @param value - IRI reference from the document.
 * @param base - Base IRI for relative references.
 */
export function resolveAbsoluteIri(value: string, base: string): string | null {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
    try {
      new URL(value);
      return value;
    } catch {
      return null;
    }
  }
  try {
    return new URL(value, base).href;
  } catch {
    return null;
  }
}

function resolveIri(value: string, base: string): string {
  return resolveAbsoluteIri(value, base) ?? value;
}

/**
 * Parse an HTTP `Link` header and return the targets with the requested relation.
 *
 * @param header - Raw `Link` header value, when present.
 * @param relation - Relation URI to match.
 */
export function parseLinkHeader(header: string | null, relation: string): string[] {
  if (header === null || header.trim() === "") {
    return [];
  }
  const targets: string[] = [];
  const parts = header.split(/,(?=\s*<)/);
  for (const part of parts) {
    const match = /^\s*<([^>]*)>(.*)$/.exec(part);
    if (match === null) {
      continue;
    }
    const target = match[1] as string;
    const params = match[2] ?? "";
    for (const param of params.split(";")) {
      const [rawName, rawValue] = param.split("=");
      if (rawName === undefined || rawValue === undefined) {
        continue;
      }
      if (rawName.trim().toLowerCase() !== "rel") {
        continue;
      }
      const value = rawValue.trim().replace(/^"|"$/g, "");
      if (value.split(/\s+/).includes(relation)) {
        targets.push(target);
      }
    }
  }
  return targets;
}

/**
 * Resolve the OpenID Provider issuer for a WebID by reading its profile.
 *
 * Order: `solid:oidcIssuer` triple for the exact WebID (Turtle or JSON-LD), then a
 * `rel="http://www.w3.org/ns/solid/terms#oidcIssuer"` `Link` header. Failures are
 * discovered errors with actionable messages.
 *
 * @param webId - WebID supplied by the application or the user.
 * @param fetchImpl - Runtime `fetch` implementation.
 */
export async function discoverIssuerForWebId(webId: string, fetchImpl: typeof fetch): Promise<string> {
  const location = validateWebId(webId);
  const response = await httpFetch(
    location.documentUrl,
    {
      headers: {
        accept: "text/turtle, application/ld+json;q=0.9, text/html;q=0.8, */*;q=0.1",
      },
      redirect: "follow",
    },
    { fetchImpl },
  );
  if (!isOk(response)) {
    throw new SebaDiscoveryError(
      `Fetching the WebID profile for "${webId}" failed with HTTP ${String(response.status)}. ` +
        `Requested ${location.documentUrl}; the profile must be publicly readable.`,
    );
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const linkIssuers = parseLinkHeader(response.headers.get("link"), OIDC_ISSUER_PREDICATE);
  const text = await readText(response, "WebID profile");

  let statements: IssuerStatement[] = [];
  let parseFailure: string | null = null;
  if (contentType.includes("json")) {
    try {
      statements = extractJsonLdIssuers(JSON.parse(text) as unknown, location.documentUrl);
    } catch (error) {
      parseFailure = error instanceof Error ? error.message : "invalid JSON";
    }
  } else if (contentType.includes("turtle") || contentType === "" || contentType.includes("text/plain")) {
    try {
      statements = extractIssuerStatements(parseTurtle(text, location.documentUrl));
    } catch (error) {
      parseFailure = error instanceof Error ? error.message : "invalid Turtle";
    }
  }

  const matching = statements.filter(
    (statement) => statement.subject === location.webId || statement.subject === location.documentUrl,
  );
  const issuers = [...new Set(matching.map((statement) => statement.issuer))];

  if (issuers.length > 1) {
    throw new SebaDiscoveryError(
      `The WebID profile for "${webId}" declares more than one solid:oidcIssuer (${issuers.join(", ")}). ` +
        "A WebID must trust exactly one identity provider.",
    );
  }
  const chosen = issuers[0] ?? linkIssuers[0];
  if (chosen === undefined) {
    const detail = parseFailure === null ? "" : ` The profile could not be parsed: ${parseFailure}`;
    throw new SebaDiscoveryError(
      `The WebID profile for "${webId}" does not state "<${location.webId}> <${OIDC_ISSUER_PREDICATE}> <issuer>".` +
        `${detail} Content-Type was "${contentType || "missing"}". ` +
        "Add the solid:oidcIssuer triple to the profile, or pass an explicit issuer in the login options.",
    );
  }
  return validateIssuerUrl(chosen, "identity provider issuer");
}

/**
 * Tiny, dependency-free helpers for the Turtle subset used by Solid pods.
 *
 * Supported syntax: `.`-terminated triples with `<iri>`, `_:blank`, and literal
 * terms (`"value"`, `"value"@lang`, `"value"^^<datatype>`), plus bare integers,
 * decimals and booleans. `@prefix`/`PREFIX`/`BASE` lines are ignored; prefix
 * expansion is not performed, so terms must already be absolute.
 */

const XSD = "http://www.w3.org/2001/XMLSchema#";

/** A Turtle term. */
export type PodTerm =
  | { termType: "NamedNode"; value: string }
  | { termType: "BlankNode"; value: string }
  | { termType: "Literal"; value: string; language?: string; datatype?: string };

/** One subject-predicate-object statement. */
export interface PodTriple {
  readonly subject: PodTerm;
  readonly predicate: PodTerm;
  readonly object: PodTerm;
}

/** Scalar produced by {@link objectify}. */
export type PodValue = string | number | boolean | { id: string };

/** Nested `subject → predicate → value` view of a triple list. */
export type PodDocument = Record<string, Record<string, PodValue | PodValue[]>>;

/**
 * Parse a small Turtle document into triples.
 *
 * @throws Error when a statement does not contain exactly three supported terms.
 */
export function parseSubjectTriples(input: string): PodTriple[] {
  const tokens = tokenize(input);
  const triples: PodTriple[] = [];
  let statement: string[] = [];

  for (const token of tokens) {
    if (token === ".") {
      if (statement.length === 0) {
        continue;
      }
      if (statement.length !== 3) {
        throw new Error(
          `Unsupported Turtle statement: expected 3 terms, found ${String(statement.length)}.`,
        );
      }
      triples.push({
        subject: parseTerm(statement[0]!),
        predicate: parseTerm(statement[1]!),
        object: parseTerm(statement[2]!),
      });
      statement = [];
      continue;
    }
    statement.push(token);
  }

  if (statement.length > 0) {
    throw new Error("Unsupported Turtle: the final statement is not terminated by '.'.");
  }
  return triples;
}

/** Turn triples into a nested `{ [subject]: { [predicate]: value } }` object. */
export function objectify(triples: readonly PodTriple[]): PodDocument {
  const document: PodDocument = {};
  for (const { subject, predicate, object } of triples) {
    const bucket = (document[subject.value] ??= {});
    const value = toValue(object);
    const existing = bucket[predicate.value];
    if (existing === undefined) {
      bucket[predicate.value] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      bucket[predicate.value] = [existing, value];
    }
  }
  return document;
}

/** Serialize triples to Turtle, one statement per line. */
export function toTurtle(triples: readonly PodTriple[]): string {
  return triples
    .map(({ subject, predicate, object }) => `${formatTerm(subject)} ${formatTerm(predicate)} ${formatTerm(object)} .`)
    .join("\n");
}

/** The three helpers, also exposed as `Seba.pod`. */
export const pod = { parseSubjectTriples, objectify, toTurtle };

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let index = 0;

  while (index < input.length) {
    const character = input[index]!;

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "#") {
      while (index < input.length && input[index] !== "\n") {
        index += 1;
      }
      continue;
    }
    if (isDirectiveStart(input, index)) {
      while (index < input.length && input[index] !== "\n") {
        index += 1;
      }
      continue;
    }
    if (character === "<") {
      const end = input.indexOf(">", index);
      if (end < 0) {
        throw new Error("Unsupported Turtle: unterminated IRI.");
      }
      tokens.push(input.slice(index, end + 1));
      index = end + 1;
      continue;
    }
    if (character === '"') {
      let cursor = index + 1;
      let token = '"';
      while (cursor < input.length) {
        const current = input[cursor]!;
        token += current;
        cursor += 1;
        if (current === "\\") {
          token += input[cursor] ?? "";
          cursor += 1;
          continue;
        }
        if (current === '"') {
          break;
        }
      }
      while (cursor < input.length) {
        if (input[cursor] === "@") {
          let end = cursor + 1;
          while (end < input.length && /[A-Za-z0-9-]/.test(input[end]!)) {
            end += 1;
          }
          token += input.slice(cursor, end);
          cursor = end;
          continue;
        }
        if (input.startsWith("^^", cursor)) {
          const iriStart = input.indexOf("<", cursor);
          const iriEnd = iriStart < 0 ? -1 : input.indexOf(">", iriStart);
          if (iriStart < 0 || iriEnd < 0) {
            throw new Error("Unsupported Turtle: malformed datatype suffix.");
          }
          token += input.slice(cursor, iriEnd + 1);
          cursor = iriEnd + 1;
          continue;
        }
        break;
      }
      tokens.push(token);
      index = cursor;
      continue;
    }
    if (character === "." && isStatementEnd(input, index)) {
      tokens.push(".");
      index += 1;
      continue;
    }

    let end = index;
    while (end < input.length && !/[\s]/.test(input[end]!)) {
      if (input[end] === "." && isStatementEnd(input, end)) {
        break;
      }
      end += 1;
    }
    tokens.push(input.slice(index, end));
    index = end;
  }

  return tokens;
}

function isStatementEnd(input: string, index: number): boolean {
  const next = input[index + 1];
  return next === undefined || /\s/.test(next);
}

function isDirectiveStart(input: string, index: number): boolean {
  const lineStart = /(?:^|\n)[ \t]*$/.test(input.slice(0, index));
  if (!lineStart) {
    return false;
  }
  return /^(@prefix|@base|PREFIX\b|BASE\b)/i.test(input.slice(index));
}

function parseTerm(token: string): PodTerm {
  if (token.startsWith("<") && token.endsWith(">")) {
    return { termType: "NamedNode", value: token.slice(1, -1) };
  }
  if (token.startsWith("_:")) {
    return { termType: "BlankNode", value: token.slice(2) };
  }
  if (token.startsWith('"')) {
    const end = closingQuoteIndex(token);
    const literal: PodTerm = { termType: "Literal", value: unescapeLiteral(token.slice(1, end)) };
    const suffix = token.slice(end + 1);
    if (suffix.startsWith("@")) {
      literal.language = suffix.slice(1);
    } else if (suffix.startsWith("^^")) {
      const datatype = suffix.slice(2);
      literal.datatype = datatype.startsWith("<") ? datatype.slice(1, -1) : datatype;
    }
    return literal;
  }
  if (token === "true" || token === "false") {
    return { termType: "Literal", value: token, datatype: `${XSD}boolean` };
  }
  if (/^[+-]?\d+$/.test(token)) {
    return { termType: "Literal", value: token, datatype: `${XSD}integer` };
  }
  if (/^[+-]?(?:\d+\.\d*|\.\d+)$/.test(token)) {
    return { termType: "Literal", value: token, datatype: `${XSD}decimal` };
  }
  throw new Error(`Unsupported Turtle term: ${token}`);
}

function closingQuoteIndex(token: string): number {
  for (let index = 1; index < token.length; index += 1) {
    if (token[index] === "\\") {
      index += 1;
      continue;
    }
    if (token[index] === '"') {
      return index;
    }
  }
  throw new Error("Unsupported Turtle: unterminated literal.");
}

function unescapeLiteral(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function toValue(term: PodTerm): PodValue {
  if (term.termType !== "Literal") {
    return { id: term.value };
  }
  switch (term.datatype) {
    case `${XSD}boolean`:
      return term.value === "true";
    case `${XSD}integer`:
    case `${XSD}decimal`:
    case `${XSD}double`: {
      const numeric = Number(term.value);
      return Number.isFinite(numeric) ? numeric : term.value;
    }
    default:
      return term.value;
  }
}

function formatTerm(term: PodTerm): string {
  if (term.termType === "NamedNode") {
    return `<${term.value}>`;
  }
  if (term.termType === "BlankNode") {
    return `_:${term.value.replace(/^_:/, "")}`;
  }
  if (
    term.datatype === `${XSD}integer` ||
    term.datatype === `${XSD}decimal` ||
    term.datatype === `${XSD}double` ||
    term.datatype === `${XSD}boolean`
  ) {
    return term.value;
  }
  const escaped = term.value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  if (term.language !== undefined) {
    return `"${escaped}"@${term.language}`;
  }
  if (term.datatype !== undefined) {
    return `"${escaped}"^^<${term.datatype}>`;
  }
  return `"${escaped}"`;
}

import { describe, expect, it } from "vitest";

import { objectify, parseSubjectTriples, pod, toTurtle } from "../../src/index.js";

const XSD = "http://www.w3.org/2001/XMLSchema#";
const SOLID = "http://www.w3.org/ns/solid/terms#";

describe("pod helpers", () => {
  it("parses IRIs, blank nodes and literals", () => {
    const triples = parseSubjectTriples(`
      @prefix solid: <http://www.w3.org/ns/solid/terms#>.
      <https://alice.example/card> <${SOLID}oidcIssuer> <https://idp.example> .
      _:b0 <https://schema.org/name> "Alice"@en .
      <https://alice.example/card> <https://schema.org/age> 42 .
    `);
    expect(triples).toHaveLength(3);
    expect(triples[0]?.object).toEqual({ termType: "NamedNode", value: "https://idp.example" });
    expect(triples[1]?.subject).toEqual({ termType: "BlankNode", value: "b0" });
    expect(triples[1]?.object).toMatchObject({ language: "en" });
    expect(triples[2]?.object).toEqual({ termType: "Literal", value: "42", datatype: `${XSD}integer` });
  });

  it("turns triples into a nested document", () => {
    const triples = parseSubjectTriples(`
      <https://alice.example/card> <https://schema.org/name> "Alice" .
      <https://alice.example/card> <https://schema.org/knows> <https://bob.example/card> .
      <https://alice.example/card> <https://schema.org/age> 42 .
      <https://alice.example/card> <https://schema.org/active> true .
    `);
    expect(objectify(triples)).toEqual({
      "https://alice.example/card": {
        "https://schema.org/name": "Alice",
        "https://schema.org/knows": { id: "https://bob.example/card" },
        "https://schema.org/age": 42,
        "https://schema.org/active": true,
      },
    });
  });

  it("collects repeated predicates into an array", () => {
    const triples = parseSubjectTriples(`
      <https://alice.example/card> <https://schema.org/knows> <https://bob.example/card> .
      <https://alice.example/card> <https://schema.org/knows> <https://carol.example/card> .
    `);
    expect(objectify(triples)["https://alice.example/card"]?.["https://schema.org/knows"]).toEqual([
      { id: "https://bob.example/card" },
      { id: "https://carol.example/card" },
    ]);
  });

  it("round-trips literals with escapes, language and datatype", () => {
    const triples = parseSubjectTriples(`
      <https://alice.example/card> <https://schema.org/name> "Alice \\"Ally\\"\\nSmith" .
      <https://alice.example/card> <https://schema.org/description> "Bonjour"@fr .
      <https://alice.example/card> <https://schema.org/age> 42 .
    `);
    const turtle = toTurtle(triples);
    expect(turtle).toContain('"Alice \\"Ally\\"\\nSmith"');
    expect(turtle).toContain('"Bonjour"@fr');
    expect(turtle).toContain(" <https://schema.org/age> 42 .");
    expect(parseSubjectTriples(turtle)).toEqual(triples);
  });

  it("rejects unsupported statements", () => {
    expect(() => parseSubjectTriples("<https://a> <https://b> .")).toThrow(/expected 3 terms/);
  });

  it("is reachable through the pod namespace without hanging off the facade", () => {
    expect(pod.parseSubjectTriples).toBe(parseSubjectTriples);
    expect(pod.toTurtle).toBe(toTurtle);
    expect(pod.objectify).toBe(objectify);
  });
});

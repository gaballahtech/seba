/**
 * Known Solid provider branding for the `<seba-login>` picker.
 *
 * Each entry carries a human-friendly name, a sign-up link and a small inline
 * SVG tile (data URI on a colored backdrop). Unknown issuers fall back to a
 * monogram tile derived from the hostname so no provider ever renders bare.
 */

const HEXAGON =
  "M256 48 L436.1 152 L436.1 360 L256 464 L75.9 360 L75.9 152 Z";

function svg(data: string): string {
  return `data:image/svg+xml,${encodeURIComponent(data)}`;
}

function tile(bg: string, body: string): string {
  return svg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${bg}"/><path d="${HEXAGON}" fill="${body}"/></svg>`,
  );
}

function monogramTile(bg: string, letter: string, fg = "#FFFFFF"): string {
  return svg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${bg}"/><text x="256" y="256" dy="0.36em" text-anchor="middle" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="270" font-weight="600" fill="${fg}">${letter}</text></svg>`,
  );
}

export interface ProviderInfo {
  /** Marketing name, e.g. "Solid Project". */
  readonly name: string;
  /** Account sign-up URL, or `null` when unknown (hosts fall back to `get-a-pod`). */
  readonly signup: string | null;
  /** 48x48 inline SVG tile, ready for `<img src>`. */
  readonly iconUri: string;
}

const PURPLE = "#7C3AED";
const LAVENDER = "#EDE6FF";
const NAVY = "#1D2333";
const TEAL = "#0E7C86";
const VIOLET = "#5B21B6";

/** Curated entries for the providers Solid users actually have Pods on. */
export const PROVIDER_INFO: Readonly<Record<string, ProviderInfo>> = {
  "https://solidcommunity.net/": {
    name: "Solid Project",
    signup: "https://solidcommunity.net/register",
    iconUri: tile(LAVENDER, PURPLE),
  },
  "https://login.inrupt.com/": {
    name: "Inrupt",
    signup: "https://signup.inrupt.com/",
    iconUri: monogramTile(NAVY, "i"),
  },
  "https://inrupt.net/": {
    name: "Inrupt.net",
    signup: "https://inrupt.net/register",
    iconUri: monogramTile(NAVY, "I"),
  },
  "https://trinpod.eu/": {
    name: "trinpod",
    signup: "https://trinpod.eu/",
    iconUri: monogramTile(TEAL, "t"),
  },
  "https://solidweb.org/": {
    name: "SolidWeb.org",
    signup: "https://solidweb.org/register",
    iconUri: monogramTile(VIOLET, "S"),
  },
};

const FALLBACK_HUES = ["#7C3AED", "#0E7C86", "#B45309", "#1D4ED8", "#9D174D", "#065F46"];

/** Branding for any issuer, known or synthesized. */
export function providerInfo(issuer: string): ProviderInfo {
  const key = normalizeIssuer(issuer);
  const known = PROVIDER_INFO[key];
  if (known) {
    return known;
  }
  let host = "solid community";
  try {
    host = new URL(key).hostname;
  } catch {
    /* bad issuer: neutral fallback name */
  }
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return {
    name: host,
    signup: null,
    iconUri: monogramTile(
      FALLBACK_HUES[hash % FALLBACK_HUES.length] ?? "#7C3AED",
      host.replace(/^www\./, "").charAt(0).toUpperCase() || "P",
    ),
  };
}

/** Absolute http(s) issuer with a single trailing slash, or the original string. */
export function normalizeIssuer(issuer: string): string {
  try {
    const url = new URL(issuer);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    /* not parseable — let callers decide */
  }
  return issuer;
}

/** Domain part of an issuer for display, e.g. "login.inrupt.com". */
export function issuerDomain(issuer: string): string {
  try {
    return new URL(issuer).hostname;
  } catch {
    return issuer.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

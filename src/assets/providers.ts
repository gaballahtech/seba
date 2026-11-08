/**
 * Known Solid provider branding for the `<seba-login>` picker.
 *
 * Each entry carries a human-friendly name, a sign-up link and small inline
 * artwork (the service's own favicon packaged at 48x48). Unknown issuers fall
 * back to a monogram tile derived from the hostname so no provider renders bare.
 */

import { PROVIDER_ART } from "./provider-art.js";

export interface ProviderInfo {
  /** Marketing name, e.g. "Solid Project". */
  readonly name: string;
  /** Account sign-up URL, or `null` when unknown (hosts fall back to `get-a-pod`). */
  readonly signup: string | null;
  /** 48x48 inline artwork data URI, ready for `<img src>`. */
  readonly iconUri: string;
}

function svg(data: string): string {
  return `data:image/svg+xml,${encodeURIComponent(data)}`;
}

function monogramTile(bg: string, letter: string, fg = "#FFFFFF"): string {
  return svg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${bg}"/><text x="256" y="256" dy="0.36em" text-anchor="middle" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="270" font-weight="600" fill="${fg}">${letter}</text></svg>`,
  );
}

/** Curated entries for the providers Solid users actually have Pods on. */
export const PROVIDER_INFO: Readonly<Record<string, ProviderInfo>> = {
  "https://solidcommunity.net/": {
    name: "Solid Project",
    signup: "https://solidcommunity.net/",
    iconUri: PROVIDER_ART["https://solidcommunity.net/"],
  },
  "https://login.inrupt.com/": {
    name: "Inrupt",
    signup: "https://start.inrupt.com/profile",
    iconUri: PROVIDER_ART["https://login.inrupt.com/"],
  },
  "https://trinpod.eu/": {
    name: "trinpod",
    signup: "https://trinpod.eu/",
    iconUri: PROVIDER_ART["https://trinpod.eu/"],
  },
  "https://trinpod.us/": {
    name: "trinpod",
    signup: "https://trinpod.us/",
    iconUri: PROVIDER_ART["https://trinpod.us/"],
  },
  "https://pods.solidcommunity.au/": {
    name: "Solid AU",
    signup: "https://pods.solidcommunity.au/",
    iconUri: PROVIDER_ART["https://pods.solidcommunity.au/"],
  },
  "https://solidweb.app/": {
    name: "SolidWeb.app",
    signup: "https://solidweb.app/",
    iconUri: PROVIDER_ART["https://solidweb.app/"],
  },
  "https://teamid.live/": {
    name: "teamID",
    signup: "https://teamid.live/",
    iconUri: PROVIDER_ART["https://teamid.live/"],
  },
  "https://solid.openlinksw.com:8445/": {
    name: "OpenLink",
    signup: "https://solid.openlinksw.com:8445/register",
    iconUri: PROVIDER_ART["https://solid.openlinksw.com:8445/"],
  },
  "https://solidweb.org/": {
    name: "SolidWeb.org",
    signup: "https://solidweb.org/",
    iconUri: PROVIDER_ART["https://solidweb.org/"],
  },
  "https://solidweb.me/": {
    name: "SolidWeb.me",
    signup: "https://solidweb.me/",
    iconUri: PROVIDER_ART["https://solidweb.me/"],
  },
};

/**
 * The default choice set: the five community Pods every developer expects.
 * An app that omits `providers` gets these; an app passes its own list instead.
 */
export const DEFAULT_PROVIDERS: readonly string[] = [
  "https://solidcommunity.net/",
  "https://login.inrupt.com/",
  "https://solidweb.org/",
  "https://solidweb.me/",
  "https://trinpod.eu/",
];

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

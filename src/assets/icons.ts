/**
 * SEBA brand assets.
 *
 * The 512x512 PNG originals in `assets/` are shipped with the package through the
 * `./assets/*` export for og:image, favicons and contexts that do not accept SVG. The
 * sign-in button uses inline SVG data URIs instead, so it paints without a network
 * request, stays crisp at any pixel density and keeps the core dependency-free.
 */

import { SEBA_SVG_DATA } from "./svg-data.js";

/** Supported logo treatments. */
export type SebaLogoVariant = "primary" | "inverse" | "monochrome" | "solid" | "favicon";

/** One brand asset. */
export interface SebaLogoAsset {
  /** Treatment name. */
  readonly variant: SebaLogoVariant;
  /** Human readable description. */
  readonly label: string;
  /** Packaged 512x512 PNG original, relative to the package root. */
  readonly png: string;
  /** Inline `data:image/svg+xml,...` rendering for runtime use. */
  readonly dataUri: string;
  /** Intrinsic width of the inlined artwork. */
  readonly width: 48;
  /** Intrinsic height of the inlined artwork. */
  readonly height: 48;
}

function asset(
  variant: SebaLogoVariant,
  label: string,
  png: string,
): SebaLogoAsset {
  return { variant, label, png, dataUri: SEBA_SVG_DATA[variant], width: 48, height: 48 };
}

const ASSETS: Record<SebaLogoVariant, SebaLogoAsset> = {
  primary: asset("primary", "SEBA logo", "assets/seba-logo-primary.png"),
  inverse: asset("inverse", "SEBA logo (inverse)", "assets/seba-logo-inverse.png"),
  monochrome: asset("monochrome", "SEBA logo (monochrome)", "assets/seba-logo-monochrome.png"),
  solid: asset("solid", "SEBA icon", "assets/seba-icon-solid.png"),
  favicon: asset("favicon", "SEBA favicon", "assets/seba-icon-favicon.png"),
};

/** Manifest of every brand asset. */
export const sebaLogo: Readonly<Record<SebaLogoVariant, SebaLogoAsset>> = ASSETS;

/** Inline SVG data URI for a logo treatment, ready for an `<img src>`. */
export function sebaLogoImage(variant: SebaLogoVariant = "primary"): string {
  return ASSETS[variant].dataUri;
}

/** Whether a string names a known logo treatment. */
export function isSebaLogoVariant(value: string): value is SebaLogoVariant {
  return Object.prototype.hasOwnProperty.call(ASSETS, value);
}

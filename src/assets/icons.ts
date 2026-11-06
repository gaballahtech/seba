/**
 * SEBA brand assets (PNG only).
 *
 * The 512x512 PNGs in `assets/` are shipped with the package through the `./assets/*`
 * export. A 64x64 PNG rendering of each treatment is inlined as a data URI so the
 * sign-in button paints without a network request and the core keeps zero runtime
 * dependencies.
 */

import { SEBA_PNG_DATA } from "./png-data.js";

/** Supported logo treatments. */
export type SebaLogoVariant = "primary" | "inverse" | "monochrome" | "solid" | "favicon";

/** One brand asset. */
export interface SebaLogoAsset {
  /** Treatment name. */
  readonly variant: SebaLogoVariant;
  /** Human readable description. */
  readonly label: string;
  /** Packaged 512x512 PNG file, relative to the package root. */
  readonly png: string;
  /** Inline `data:image/png;base64,...` rendering for runtime use. */
  readonly dataUri: string;
  /** Intrinsic width of the inlined PNG. */
  readonly width: 64;
  /** Intrinsic height of the inlined PNG. */
  readonly height: 64;
}

function asset(
  variant: SebaLogoVariant,
  label: string,
  png: string,
): SebaLogoAsset {
  return { variant, label, png, dataUri: SEBA_PNG_DATA[variant], width: 64, height: 64 };
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

/** Inline PNG data URI for a logo treatment, ready for an `<img src>`. */
export function sebaLogoImage(variant: SebaLogoVariant = "primary"): string {
  return ASSETS[variant].dataUri;
}

/** Whether a string names a known logo treatment. */
export function isSebaLogoVariant(value: string): value is SebaLogoVariant {
  return Object.prototype.hasOwnProperty.call(ASSETS, value);
}

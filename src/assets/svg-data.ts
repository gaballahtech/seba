/**
 * Inline SVG renderings of the SEBA brand artwork.
 *
 * Each of the five treatments is drawn as a 48x48 SVG data URI so the element paints
 * without a network request and stays crisp on any display. The raster originals remain
 * in `assets/` for og:image, favicons and contexts that do not accept SVG.
 */

export const SEBA_SVG_DATA = {
  primary: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 512 512'%3E%3Cpath d='M256.0 48.0L436.1 152.0L436.1 360.0L256.0 464.0L75.9 360.0L75.9 152.0Z' fill='none' stroke='%237C4DFF' stroke-width='32' stroke-linejoin='miter'/%3E%3Cpath d='M385.0 256.0L307.7 234.6L347.2 164.8L277.4 204.3L256.0 127.0L234.6 204.3L164.8 164.8L204.3 234.6L127.0 256.0L204.3 277.4L164.8 347.2L234.6 307.7L256.0 385.0L277.4 307.7L347.2 347.2L307.7 277.4Z' fill='%237C4DFF'/%3E%3C/svg%3E",
  monochrome: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 512 512'%3E%3Cpath d='M256.0 48.0L436.1 152.0L436.1 360.0L256.0 464.0L75.9 360.0L75.9 152.0Z' fill='none' stroke='%23000000' stroke-width='32' stroke-linejoin='miter'/%3E%3Cpath d='M385.0 256.0L307.7 234.6L347.2 164.8L277.4 204.3L256.0 127.0L234.6 204.3L164.8 164.8L204.3 234.6L127.0 256.0L204.3 277.4L164.8 347.2L234.6 307.7L256.0 385.0L277.4 307.7L347.2 347.2L307.7 277.4Z' fill='%23000000'/%3E%3C/svg%3E",
  inverse: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' fill='%230B0B0F'/%3E%3Cpath d='M256.0 48.0L436.1 152.0L436.1 360.0L256.0 464.0L75.9 360.0L75.9 152.0Z' fill='none' stroke='%23FFFFFF' stroke-width='32' stroke-linejoin='miter'/%3E%3Cpath d='M385.0 256.0L307.7 234.6L347.2 164.8L277.4 204.3L256.0 127.0L234.6 204.3L164.8 164.8L204.3 234.6L127.0 256.0L204.3 277.4L164.8 347.2L234.6 307.7L256.0 385.0L277.4 307.7L347.2 347.2L307.7 277.4Z' fill='%23FFFFFF'/%3E%3C/svg%3E",
  solid: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 512 512'%3E%3Cpath d='M256.0 48.0L436.1 152.0L436.1 360.0L256.0 464.0L75.9 360.0L75.9 152.0Z' fill='%237C4DFF'/%3E%3Cpath d='M385.0 256.0L307.7 234.6L347.2 164.8L277.4 204.3L256.0 127.0L234.6 204.3L164.8 164.8L204.3 234.6L127.0 256.0L204.3 277.4L164.8 347.2L234.6 307.7L256.0 385.0L277.4 307.7L347.2 347.2L307.7 277.4Z' fill='%23FFFFFF'/%3E%3C/svg%3E",
  favicon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' fill='%23FFFFFF'/%3E%3Cpath d='M256.0 48.0L436.1 152.0L436.1 360.0L256.0 464.0L75.9 360.0L75.9 152.0Z' fill='%237C4DFF'/%3E%3Cpath d='M385.0 256.0L307.7 234.6L347.2 164.8L277.4 204.3L256.0 127.0L234.6 204.3L164.8 164.8L204.3 234.6L127.0 256.0L204.3 277.4L164.8 347.2L234.6 307.7L256.0 385.0L277.4 307.7L347.2 347.2L307.7 277.4Z' fill='%23FFFFFF'/%3E%3C/svg%3E",
} as const;

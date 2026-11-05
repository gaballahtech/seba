/**
 * Browser entry point (`@gaballahtech/seba/browser`).
 *
 * Identical to the root entry point; browsers resolve the platform themselves. The
 * subpath exists so bundlers can target a browser-only module graph.
 */

export * from "../index.js";
export { createBrowserPlatform } from "./platform.js";

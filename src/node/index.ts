/**
 * Node.js entry point (`seba/node`).
 *
 * Identical to the root entry point; Node.js resolves its platform itself. The subpath
 * exists so server bundles never pull in browser-only modules.
 */

export * from "../index.js";
export { createNodePlatform } from "./platform.js";

/**
 * Public entry point of the `seba` package.
 *
 * @example
 * ```ts
 * import { Seba } from "seba";
 *
 * const seba = new Seba({
 *   clientId: "https://myapp.example/client-id.jsonld",
 *   redirectUri: "https://myapp.example/auth/callback",
 * });
 * ```
 */
export type { DPoPProof, LoginOptions, SebaConfig, Session, StorageKind, TokenSet } from "./types.js";
export {
  SebaAuthError,
  SebaConfigError,
  SebaDiscoveryError,
  SebaDPoPError,
  SebaError,
  SebaNetworkError,
  SebaNoUIError,
  SebaRedirectMismatchError,
  SebaSessionExpiredError,
  isSebaError,
} from "./core/errors.js";
export type { SebaErrorCode } from "./core/errors.js";
export { Seba } from "./seba.js";

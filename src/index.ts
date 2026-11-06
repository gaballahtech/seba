/**
 * Public entry point of the `@gaballahtech/seba` package.
 *
 * @example
 * ```ts
 * import { Seba } from "@gaballahtech/seba";
 *
 * const seba = new Seba({
 *   clientId: "https://myapp.example/client-id.jsonld",
 *   redirectUri: "https://myapp.example/auth/callback",
 * });
 * ```
 */
export type {
  ComplianceTolerances,
  DPoPProof,
  LoginOptions,
  SebaConfig,
  Session,
  SessionChangeEvent,
  SessionChangeListener,
  SessionChangeReason,
  SessionInfo,
  StorageKind,
  TokenSet,
} from "./types.js";
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
export { objectify, parseSubjectTriples, pod, toTurtle } from "./pod.js";
export type { PodDocument, PodTerm, PodTriple, PodValue } from "./pod.js";
export { isSebaLogoVariant, sebaLogo, sebaLogoImage } from "./assets/icons.js";
export type { SebaLogoAsset, SebaLogoVariant } from "./assets/icons.js";
export { SebaLoginElement, defineSebaLogin } from "./element.js";

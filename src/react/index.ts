/**
 * React bindings (`@gaballahtech/seba/react`).
 *
 * `react` is an optional peer dependency: the core entry point never imports this file.
 * The wrapper registers `<seba-login>` on mount, so no separate setup call is needed.
 */

import { createElement, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { defineSebaLogin } from "../element.js";
import type { SebaLoginElement } from "../element.js";
import type { SebaConfig, Session } from "../types.js";
import type { Seba } from "../seba.js";

/** Props accepted by {@link SebaLoginButton}. */
export interface SebaLoginButtonProps {
  /** Published Solid Client ID Document URL. */
  clientId: string;
  /** Redirect URI registered in the Client ID Document. */
  redirectUri: string;
  /** Identity provider issuer, used instead of WebID discovery. */
  issuer?: string;
  /** WebID whose profile lists the provider. */
  webId?: string;
  /** Button text while signed out. */
  label?: string;
  /** Colour scheme. Defaults to the system preference. */
  theme?: "auto" | "light" | "dark";
  /** Logo treatment, or `"none"`. Defaults to the theme's treatment. */
  logo?: "primary" | "inverse" | "monochrome" | "solid" | "favicon" | "none";
  /** Multi-account storage namespace. */
  account?: string;
  /** Advanced configuration (e.g. per-provider `tolerances`), serialized into the element. */
  config?: Partial<Omit<SebaConfig, "clientId" | "redirectUri">>;
  /** Extra class name for the host element. */
  className?: string;
  /** Called after a successful login or restore. */
  onLogin?: (session: Session) => void;
  /** Called after logout. */
  onLogout?: () => void;
  /** Called when the session expires. */
  onSessionExpired?: () => void;
  /** Called with any login, logout or configuration error. */
  onError?: (error: unknown) => void;
}

/** A Solid sign-in button backed by `<seba-login>`. */
export function SebaLoginButton(props: SebaLoginButtonProps): ReactElement {
  const host = useRef<SebaLoginElement | null>(null);

  useEffect(() => {
    defineSebaLogin();
    const element = host.current;
    if (element === null) {
      return;
    }
    const onLogin = (event: Event): void => {
      props.onLogin?.((event as CustomEvent<{ session: Session }>).detail.session);
    };
    const onLogout = (): void => {
      props.onLogout?.();
    };
    const onExpired = (): void => {
      props.onSessionExpired?.();
    };
    const onError = (event: Event): void => {
      props.onError?.((event as CustomEvent<{ error: unknown }>).detail.error);
    };
    element.addEventListener("seba:login", onLogin);
    element.addEventListener("seba:restore", onLogin);
    element.addEventListener("seba:logout", onLogout);
    element.addEventListener("seba:session-expired", onExpired);
    element.addEventListener("seba:error", onError);
    return () => {
      element.removeEventListener("seba:login", onLogin);
      element.removeEventListener("seba:restore", onLogin);
      element.removeEventListener("seba:logout", onLogout);
      element.removeEventListener("seba:session-expired", onExpired);
      element.removeEventListener("seba:error", onError);
    };
  }, [props.onLogin, props.onLogout, props.onSessionExpired, props.onError]);

  return createElement("seba-login", {
    ref: host,
    "client-id": props.clientId,
    "redirect-uri": props.redirectUri,
    ...(props.issuer === undefined ? {} : { issuer: props.issuer }),
    ...(props.webId === undefined ? {} : { "web-id": props.webId }),
    ...(props.label === undefined ? {} : { label: props.label }),
    ...(props.theme === undefined ? {} : { theme: props.theme }),
    ...(props.logo === undefined ? {} : { logo: props.logo }),
    ...(props.account === undefined ? {} : { account: props.account }),
    ...(props.config === undefined ? {} : { config: JSON.stringify(props.config) }),
    ...(props.className === undefined ? {} : { class: props.className }),
  });
}

/**
 * Track the session of a {@link Seba} instance.
 *
 * @returns The current session, or `null` while signed out. Updates on login,
 *   restore, logout and expiry (expiry always yields `null`).
 */
export function useSession(seba: Seba | null | undefined): Session | null {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (seba === null || seba === undefined) {
      setSession(null);
      return;
    }
    let active = true;
    void seba.getSession().then((current) => {
      if (active) {
        setSession(current);
      }
    });
    const unsubscribe = seba.onSessionChange((event) => {
      setSession(event.session);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [seba]);

  return session;
}

/**
 * Minimal, dependency-free identity prompt for browsers.
 *
 * The dialog asks for a WebID by default and offers an identity-provider URL instead.
 * It is only a hint: whatever the user enters is validated and discovered by the core.
 */

import { SebaAuthError } from "../core/errors.js";
import type { LoginOptions } from "../types.js";

/**
 * Ask the user which WebID or identity provider to use.
 *
 * @returns Login options collected from the dialog.
 * @throws {@link SebaAuthError} when the user cancels or the dialog cannot be shown.
 */
export function askForIdentity(): Promise<LoginOptions> {
  return new Promise<LoginOptions>((resolve, reject) => {
    if (typeof document === "undefined" || document.body === null) {
      reject(new SebaAuthError("Cannot ask for a WebID outside a browser document."));
      return;
    }

    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "seba-dialog-title");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "background:rgba(15,23,42,0.55)",
      "font-family:system-ui,sans-serif",
      "padding:16px",
    ].join(";");

    const card = document.createElement("div");
    card.style.cssText = [
      "background:#fff",
      "color:#0f172a",
      "border-radius:12px",
      "box-shadow:0 20px 50px rgba(0,0,0,0.25)",
      "max-width:440px",
      "width:100%",
      "padding:24px",
      "display:flex",
      "flex-direction:column",
      "gap:12px",
    ].join(";");

    const title = document.createElement("h2");
    title.id = "seba-dialog-title";
    title.textContent = "Sign in to Solid";
    title.style.cssText = "margin:0;font-size:18px;";

    const description = document.createElement("p");
    description.textContent = "Enter your WebID, or the URL of the identity provider that issues your WebID.";
    description.style.cssText = "margin:0;font-size:14px;line-height:1.5;color:#334155;";

    const input = document.createElement("input");
    input.type = "url";
    input.required = true;
    input.placeholder = "https://alice.example/profile/card#me";
    input.setAttribute("aria-label", "WebID or identity provider URL");
    input.style.cssText = "padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;";

    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    error.style.cssText = "margin:0;font-size:13px;color:#b91c1c;display:none;";

    const buttons = document.createElement("div");
    buttons.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:4px;";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText = "padding:8px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Continue";
    submit.style.cssText =
      "padding:8px 14px;border:0;background:#0f172a;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;";

    const form = document.createElement("form");
    form.style.cssText = "display:flex;flex-direction:column;gap:12px;";
    form.append(input, error, buttons);
    buttons.append(cancel, submit);
    card.append(title, description, form);
    overlay.append(card);
    document.body.append(overlay);
    input.focus();

    const close = (): void => {
      overlay.remove();
    };

    cancel.addEventListener("click", () => {
      close();
      reject(new SebaAuthError("The sign-in prompt was cancelled."));
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        reject(new SebaAuthError("The sign-in prompt was cancelled."));
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (value === "") {
        error.textContent = "Enter a WebID or identity provider URL.";
        error.style.display = "block";
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        error.textContent = "That is not an absolute URL. It must start with https://";
        error.style.display = "block";
        return;
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        error.textContent = "Only https URLs are accepted (http for localhost).";
        error.style.display = "block";
        return;
      }
      close();
      // A WebID usually has a path or fragment; a bare origin is an issuer.
      const looksLikeIssuer = parsed.pathname === "/" && parsed.search === "" && parsed.hash === "";
      resolve(looksLikeIssuer ? { issuer: value } : { webId: value });
    });
  });
}

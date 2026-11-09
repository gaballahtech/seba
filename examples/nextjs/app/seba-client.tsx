"use client";
// Browser-only: SEBA login/session run in the client. Do not import into Server Components.
import "@gaballahtech/seba"; // registers <seba-login>

export function SebaClientLogin(props: { clientId: string }) {
  return <seba-login client-id={props.clientId}></seba-login> as any;
}

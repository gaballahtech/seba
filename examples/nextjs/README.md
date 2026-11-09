# Next.js example (SSR stance, T10)

This is a **minimal, illustrative** example of the browser-only pattern (ADR 0005). SEBA login/session/DPP fetch run in the browser; the server route shows a proxy *shape* only.

- `app/seba-client.tsx`: `"use client"` component that uses `<seba-login>` (browser-only).
- `app/api/pod-proxy/route.ts`: server route placeholder illustrating where a *reviewed* proxy design would live. **SEBA does not ship a server-held-token/DPP proxy.** Do not forward browser secrets insecurely.

To typecheck the example sources (documented equivalent):
```bash
npx tsc --noEmit -p examples/nextjs/tsconfig.json
```
Install `next react react-dom @types/react @types/node` in this example folder to fully resolve framework types; this repo does not add Next.js as a root dependency.

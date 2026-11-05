/**
 * React example.
 *
 * The same page starts the login, receives the callback and shows the profile. Keep the
 * component mounted on the redirect URI; `login()` detects the authorization response and
 * finishes the flow.
 */

import { useCallback, useEffect, useState } from "react";
import { Seba, isSebaError, type Session } from "@gaballahtech/seba";

const seba = new Seba({
  clientId: import.meta.env.VITE_SEBA_CLIENT_ID ?? "https://app.example/client-id.jsonld",
  redirectUri: `${window.location.origin}/auth/callback`,
});

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hasCallback = new URL(window.location.href).searchParams.has("code");

    async function boot(): Promise<void> {
      try {
        // On the callback route this completes the pending login; elsewhere it restores.
        const restored = hasCallback ? await seba.login() : await seba.restoreSession();
        if (!cancelled) {
          setSession(restored);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(describe(caught));
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      // Without a WebID the browser dialog asks for one. The page navigates away, so this
      // promise normally never resolves.
      await seba.login();
    } catch (caught) {
      setError(describe(caught));
      setBusy(false);
    }
  }, []);

  const loadProfile = useCallback(async (): Promise<void> => {
    if (session === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await seba.fetch(session.webId, { headers: { accept: "text/turtle" } });
      setProfile(response.ok ? await response.text() : `HTTP ${String(response.status)}`);
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setBusy(false);
    }
  }, [session]);

  const signOut = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      await seba.logout();
      setSession(null);
      setProfile(null);
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "3rem auto", padding: "0 1rem" }}>
      <h1>SEBA + React</h1>

      {session === null ? (
        <button type="button" onClick={() => void signIn()} disabled={busy}>
          Sign in with Solid
        </button>
      ) : (
        <section>
          <p>
            Signed in as <strong>{session.webId}</strong>
          </p>
          <p>Provider: {session.provider}</p>
          <button type="button" onClick={() => void loadProfile()} disabled={busy}>
            Read my profile
          </button>{" "}
          <button type="button" onClick={() => void signOut()} disabled={busy}>
            Sign out
          </button>
          {profile !== null && <pre style={{ whiteSpace: "pre-wrap", background: "#f1f5f9", padding: 12 }}>{profile}</pre>}
        </section>
      )}

      {error !== null && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}
    </main>
  );
}

function describe(error: unknown): string {
  if (isSebaError(error)) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

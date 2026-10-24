"use client";

import { useEffect, useRef, useState } from "react";
import Spinner from "@/components/Spinner";
import { createClient } from "@/lib/supabase/client";

type GoogleId = {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Google's own sign-in button. Signing in happens on this site, so Google's account chooser
 * names this site instead of the Supabase project address. Without a client ID it falls back
 * to the redirect sign-in.
 */
export default function GoogleButton({ next }: { next: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fallback, setFallback] = useState(!CLIENT_ID);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    const nonce = crypto.randomUUID();
    const render = async () => {
      if (cancelled || !window.google || !box.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        nonce: await sha256Hex(nonce),
        hd: "bmsce.ac.in",
        ux_mode: "popup",
        use_fedcm_for_button: true,
        callback: async ({ credential }: { credential: string }) => {
          setBusy(true);
          setError("");
          const { error } = await createClient().auth.signInWithIdToken({ provider: "google", token: credential, nonce });
          if (error) {
            setBusy(false);
            setError("Sign-in failed. Please try again.");
            return;
          }
          window.location.href = `/auth/finish?next=${encodeURIComponent(next)}`;
        },
      });
      window.google.accounts.id.renderButton(box.current, {
        theme: document.documentElement.classList.contains("dark") ? "filled_black" : "filled_blue",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: box.current.offsetWidth || 320,
      });
    };
    if (window.google) render();
    else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = render;
      script.onerror = () => setFallback(true);
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
    };
  }, [next]);

  async function redirectSignIn() {
    setBusy(true);
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Google shows only bmsce.ac.in accounts; the server checks it again.
        queryParams: { hd: "bmsce.ac.in", prompt: "select_account" },
      },
    });
  }

  if (busy) {
    return (
      <div className="flex items-center justify-center gap-2 py-2.5 text-sm text-brand-700 dark:text-brand-300">
        <Spinner /> Signing you in…
      </div>
    );
  }
  if (fallback) {
    return (
      <button onClick={redirectSignIn} className="btn-primary w-full py-2.5">
        <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
        </svg>
        Continue with Google
      </button>
    );
  }
  return (
    <div>
      <div ref={box} className="flex min-h-11 w-full justify-center" />
      {error && <p className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
      <p className="muted mt-3 text-center text-xs">
        Button not showing?{" "}
        <button type="button" onClick={() => setFallback(true)} className="underline hover:text-brand-600">
          Use the other sign-in
        </button>
      </p>
    </div>
  );
}

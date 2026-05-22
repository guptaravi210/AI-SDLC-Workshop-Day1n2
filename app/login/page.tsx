"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === "register") {
        const optionsResponse = await fetch("/api/auth/register-options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });

        if (!optionsResponse.ok) {
          const payload = (await optionsResponse.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Could not start registration");
        }

        const options = (await optionsResponse.json()) as Parameters<typeof startRegistration>[0];
        const response = await startRegistration({ optionsJSON: options });

        const verifyResponse = await fetch("/api/auth/register-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, response }),
        });

        if (!verifyResponse.ok) {
          const payload = (await verifyResponse.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Registration failed");
        }
      } else {
        const optionsResponse = await fetch("/api/auth/login-options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });

        if (!optionsResponse.ok) {
          const payload = (await optionsResponse.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Could not start login");
        }

        const options = (await optionsResponse.json()) as Parameters<typeof startAuthentication>[0];
        const response = await startAuthentication({ optionsJSON: options });

        const verifyResponse = await fetch("/api/auth/login-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, response }),
        });

        if (!verifyResponse.ok) {
          const payload = (await verifyResponse.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Login failed");
        }
      }

      router.push("/");
      router.refresh();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Authentication failed";

      const fallback = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      if (fallback.ok) {
        router.push("/");
        router.refresh();
        return;
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto mt-20 max-w-md rounded-xl border border-slate-300 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Todo Login</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use passkeys for secure authentication. In development, fallback login stays available.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded px-3 py-2 text-sm ${mode === "login" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={`rounded px-3 py-2 text-sm ${mode === "register" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
          >
            {isLoading ? "Working..." : mode === "register" ? "Register with Passkey" : "Continue with Passkey"}
          </button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </form>
      </div>
    </main>
  );
}

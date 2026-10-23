import { useEffect, useState } from "react";
import { PublicLayout } from "@/components/site/PublicLayout";
import { RegistrationHelp } from "@/components/site/RegistrationHelp";
import { PasswordSetup } from "./PasswordSetup";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Recovery() {
  const [reset, setReset] = useState(false),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const read=()=>setReset(new URLSearchParams(window.location.hash.slice(1)).has("token"));
    read();window.addEventListener('hashchange',read);
    return ()=>window.removeEventListener('hashchange',read);
  }, []);
  if (reset) return <PasswordSetup recovery />;
  return (
    <PublicLayout>
      <section className="mx-auto my-12 max-w-xl space-y-6 rounded-xl border border-border bg-card p-6 sm:p-8">
        <h1 className="text-3xl font-semibold">Recover your account</h1>
        <p>
          Request an expiring, single-use password recovery link. This does not change your account
          status or permissions.
        </p>
        {notice ? (
          <p role="status">{notice}</p>
        ) : (
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/auth/recovery", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-Isave-Request": "1" },
                  body: JSON.stringify({ email, request_key: key }),
                });
                if (r.status !== 202)
                  throw Error(
                    r.status === 429
                      ? "Too many attempts. Try again later."
                      : "Recovery is temporarily unavailable. Retry safely.",
                  );
                const data = await r.json();
                setNotice(data.message);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block">
              Email address
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <Button disabled={busy}>{busy ? "Requesting…" : "Request recovery link"}</Button>
          </form>
        )}
        <p className="text-sm text-muted-foreground">
          Local development uses Mailpit capture only. External delivery is unavailable until an
          approved provider is configured. An acknowledgement does not confirm email delivery.
        </p>
        <RegistrationHelp />
      </section>
    </PublicLayout>
  );
}

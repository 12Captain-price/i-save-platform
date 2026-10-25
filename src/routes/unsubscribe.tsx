import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { contentSupportApi } from "@/lib/content-support-api";
export const Route = createFileRoute("/unsubscribe")({ component: UnsubscribePage });
export function UnsubscribePage() {
  const [token, setToken] = useState(""),
    [confirm, setConfirm] = useState(false),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
    setToken(value.slice(0, 128));
    history.replaceState(null, "", location.pathname);
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await contentSupportApi("/api/campaign-unsubscribe", { token: token || "invalid", confirm });
      setDone(true);
      setToken("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicLayout>
      <section className="page-container max-w-xl" aria-label="Optional email preferences">
        <h1 className="text-3xl font-semibold">Optional email preferences</h1>
        <p className="my-5 text-muted-foreground">
          Opening this page does not unsubscribe you. Essential account and security messages are
          separate.
        </p>
        {error && <p role="alert">{error}</p>}
        {done ? (
          <p role="status">
            Your request has been received. Optional email preferences are processed where the link
            is valid. Essential account and security notifications are unchanged.
          </p>
        ) : (
          <form className="space-y-5" onSubmit={submit}>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              Stop optional announcement and event emails.
            </label>
            <Button disabled={busy || !confirm}>
              {busy ? "Processing…" : "Confirm unsubscribe"}
            </Button>
            <p className="text-sm text-muted-foreground">
              If the link is unavailable or expired, sign in through your usual i-Save address to
              manage Email preferences, or contact the office. No account details are shown here.
            </p>
          </form>
        )}
      </section>
    </PublicLayout>
  );
}

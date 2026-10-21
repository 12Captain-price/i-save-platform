import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { PublicLayout } from "@/components/site/PublicLayout";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — i-Save" },
      { name: "description", content: "Log in to your i-Save account." },
    ],
  }),
  component: Login,
});

export function Login() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (auth.identity?.workspace)
      void navigate({
        to: "/portal/$role/$screen",
        params: { role: auth.identity.workspace, screen: "dashboard" },
        replace: true,
      });
  }, [auth.identity?.workspace, navigate]);
  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-6 py-12 md:py-20">
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              <h1>Welcome back</h1>
            </CardTitle>
            <CardDescription>Log in to your i-Save account.</CardDescription>
          </CardHeader>
          <CardContent>
            {auth.notice && (
              <p role="status" className="mb-4 text-sm text-muted-foreground">
                {auth.notice}
              </p>
            )}
            {auth.identity && !auth.identity.workspace ? (
              <div role="status" className="space-y-4">
                <p>Your account has no workspace assigned. Please contact the office.</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    void auth
                      .logout()
                      .catch(() => setError("Could not sign out. Please try again."));
                  }}
                >
                  Log out
                </Button>
              </div>
            ) : (
              <form
                className="space-y-5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (busy) return;
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  setBusy(true);
                  setError("");
                  try {
                    await auth.login(String(data.get("email")), String(data.get("password")));
                    form.reset();
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Unable to log in. Please try again.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Label htmlFor="login-email" className="text-sm">
                  Email address
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  maxLength={255}
                  disabled={busy}
                />
                <Label htmlFor="login-password" className="text-sm">
                  Password
                </Label>
                <Input
                  id="login-password"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  placeholder="••••••••"
                  disabled={busy}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Sign out when you finish.</span>
                  <Link to="/recovery" className="text-xs text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                {error && (
                  <p
                    ref={errorRef}
                    tabIndex={-1}
                    role="alert"
                    className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy || auth.status === "loading"}
                >
                  {busy ? "Logging in…" : "Log in"}
                </Button>
              </form>
            )}
            {auth.status === "error" && (
              <Button variant="ghost" className="mt-3" onClick={() => void auth.refresh()}>
                Retry session check
              </Button>
            )}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3 border-t border-border pt-6">
            <p className="text-sm text-muted-foreground">New to i-Save?</p>
            <Button variant="outline" asChild className="w-full">
              <Link to="/register">
                Apply for membership <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </PublicLayout>
  );
}

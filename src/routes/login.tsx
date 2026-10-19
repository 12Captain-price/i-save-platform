import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [
    { title: 'Log in — i-Save member account' },
    { name: 'description', content: 'Log in to your i-Save member account.' },
  ] }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-6 py-12 md:py-20">
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Log in to your i-Save member account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={e => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              navigate({ to: '/portal/$role/$screen', params: { role: 'member', screen: 'dashboard' } as any });
            }}>
              <Label className="text-sm">Email address</Label>
              <Input type="email" name="email" required placeholder="member@example.com" />
              <Label className="text-sm">Password</Label>
              <Input type="password" name="password" required placeholder="••••••••" />
              <div className="flex items-center justify-between">
                <Label className="text-xs">
                  <input type="checkbox" className="h-4 w-4 accent-primary" /> Remember me
                </Label>
                <a href="/recovery" className="text-xs text-primary hover:underline">Forgot password?</a>
              </div>
              <Button type="submit" className="w-full">Log in</Button>
            </form>
            <p className="text-xs text-muted-foreground text-center mt-4">
              This is a demonstration. No real authentication is performed.
            </p>
          </CardContent>
          <CardFooter className="pt-6">
            <p className="text-sm text-muted-foreground">New to i-Save?</p>
            <Button variant="outline" asChild className="w-full">
              <Link to="/register">Create an account <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </PublicLayout>
  );
}

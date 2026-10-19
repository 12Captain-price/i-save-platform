import { createFileRoute, Link } from '@tanstack/react-router';
import { Lock, ArrowRight } from 'lucide-react';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/setup-password')({
  head: () => ({ meta: [
    { title: 'Set your password — i-Save' },
    { name: 'description', content: 'Set your initial password for your i-Save member account.' },
  ] }),
  component: SetupPassword,
});

function SetupPassword() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-6 py-12 md:py-20">
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Set your password</CardTitle>
            <CardDescription>Create your initial password for your i-Save member account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={e => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              if (data.get('password') !== data.get('confirm')) {
                alert('Passwords do not match.');
                return;
              }
              alert('Password set (demonstration only — no credentials are stored).');
            }}>
              <div className="space-y-2">
                <Label>New password</Label>
                <Input type="password" name="password" required minLength={8} placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <Label>Confirm password</Label>
                <Input type="password" name="confirm" required minLength={8} placeholder="••••••••" />
              </div>
              <p className="text-xs text-muted-foreground">Password must be at least 8 characters.</p>
              <Button type="submit" className="w-full">Set password <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </form>
          </CardContent>
          <CardFooter className="pt-6">
            <Button variant="outline" asChild className="w-full">
              <Link to="/login">Go to log in <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </PublicLayout>
  );
}

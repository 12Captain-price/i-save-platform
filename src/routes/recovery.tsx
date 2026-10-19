import { createFileRoute, Link } from '@tanstack/react-router';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/recovery')({
  head: () => ({ meta: [
    { title: 'Account recovery — i-Save' },
    { name: 'description', content: 'Request account recovery for your i-Save member account.' },
  ] }),
  component: Recovery,
});

function Recovery() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-6 py-12 md:py-20">
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Account recovery</CardTitle>
            <CardDescription>Request a password reset for your i-Save member account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={e => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              alert('Recovery request submitted (demonstration only — no email is sent).');
            }}>
              <div className="space-y-2">
                <Label>Email address</Label>
                <Input type="email" name="email" required placeholder="member@example.com" />
              </div>
              <Button type="submit" className="w-full">Request recovery <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </form>
            <p className="text-xs text-muted-foreground text-center mt-4">
              A recovery link will be sent to your email if an account exists. This is a demonstration.
            </p>
          </CardContent>
          <CardFooter className="pt-6">
            <Button variant="outline" asChild className="w-full">
              <Link to="/login">Back to log in <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </PublicLayout>
  );
}

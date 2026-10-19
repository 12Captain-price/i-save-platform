import { createFileRoute, Link } from '@tanstack/react-router';
import { Mail, CheckCircle2, ArrowRight } from 'lucide-react';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/verify')({
  head: () => ({ meta: [
    { title: 'Verify your email — i-Save' },
    { name: 'description', content: 'Verify your email address for your i-Save member account.' },
  ] }),
  component: Verify,
});

function Verify() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-6 py-12 md:py-20">
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto mb-4">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">Verify your email</CardTitle>
            <CardDescription>Enter the verification code sent to your email address.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={e => {
              e.preventDefault();
              alert('Email verified (demonstration only — no code is sent).');
            }}>
              <div className="space-y-2">
                <Label>Verification code</Label>
                <Input name="code" required placeholder="123456" maxLength={6} />
              </div>
              <p className="text-xs text-muted-foreground">A 6-digit code was sent to your email address.</p>
              <Button type="submit" className="w-full">Verify email <ArrowRight className="ml-2 h-4 w-4" /></Button>
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

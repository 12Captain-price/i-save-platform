import { createFileRoute, Link } from '@tanstack/react-router';
import { Mail, Phone, MapPin, UserPlus, ArrowRight } from 'lucide-react';
import { PublicLayout } from '@/components/site/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/register')({
  head: () => ({ meta: [
    { title: 'Register — Join i-Save as a member' },
    { name: 'description', content: 'Register as a member of the i-Save savings organisation.' },
  ] }),
  component: Register,
});

function Register() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-6 py-12 md:py-20">
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Start your savings journey</CardTitle>
            <CardDescription>Register as a member of the i-Save savings organisation.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={e => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              alert('Registration submitted (demonstration only — no account is created).');
            }}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>First name</Label>
                  <Input name="firstName" required placeholder="e.g. Tariro" />
                </div>
                <div className="space-y-2">
                  <Label>Last name</Label>
                  <Input name="lastName" required placeholder="e.g. Moyo" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email address</Label>
                <Input type="email" name="email" required placeholder="member@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Phone number</Label>
                <Input type="tel" name="phone" placeholder="+263 77 123 4567" />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input name="address" placeholder="e.g. 123 Main Street, Harare" />
              </div>
              <div className="space-y-2">
                <Label>Reason for registration</Label>
                <Textarea name="reason" required placeholder="Why would you like to join i-Save?" />
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input type="checkbox" required className="mt-1 accent-primary" />I understand this is a demonstration registration.
              </label>
              <Button type="submit" className="w-full">Submit registration <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </form>
            <p className="text-xs text-muted-foreground text-center mt-4">
              Your registration will be reviewed by authorised staff. You will be notified of the outcome.
            </p>
          </CardContent>
          <CardFooter className="pt-6">
            <p className="text-sm text-muted-foreground">Already have an account?</p>
            <Button variant="outline" asChild className="w-full">
              <Link to="/login">Log in <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </PublicLayout>
  );
}

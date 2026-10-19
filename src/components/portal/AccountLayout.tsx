import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeading, Field, Notice, inputClass, textareaClass } from '@/components/portal/PortalUI';
import { useDemo } from '@/components/portal/DemoProvider';
import { demoUsers, navigation } from '@/lib/portal/demo';
const logo = '/images/isave-logo-dark.png';
const zpyf = '/images/zpyf-logo.png';

export function AccountLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-6 flex items-center justify-between gap-3">
        <Link to="/" aria-label="i-Save public website">
          <img src={logo} alt="i-Save" width={1983} height={793} className="h-10 w-auto" />
        </Link>
        <Button variant="ghost" asChild>
          <Link to="/"><ArrowUpRight /> Public website</Link>
        </Button>
      </header>
      <main className="flex-1 mx-auto max-w-md w-full px-6 py-12">
        {children}
      </main>
      <footer className="border-t border-border px-6 py-6 text-xs text-muted-foreground">
        <span>i-Save</span>
        <span className="flex items-center gap-2">
          An initiative of
          <img src={zpyf} alt="Zimbabwe Progressive Youth Foundation" width={1536} height={1024} className="h-6 w-auto rounded-sm bg-foreground/95 px-1" />
        </span>
      </footer>
    </div>
  );
}

export function AccountForm({ screen }: { screen: string }) {
  const navigate = useNavigate();
  const { login } = useDemo();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const register = screen === 'register';
  const recovery = screen === 'recovery';
  const verify = screen === 'verify';
  const setupPassword = screen === 'setup-password';

  return (
    <div className="mx-auto max-w-md py-6">
      <PageHeading
        eyebrow="Member access"
        title={
          verify
            ? 'Verify your email'
            : setupPassword
              ? 'Set your password'
              : recovery
                ? 'Reset your password'
                : register
                  ? 'Start your savings journey'
                  : 'Good to see you again.'
        }
        description={
          verify
            ? 'Enter the verification code sent to your email.'
            : setupPassword
              ? 'Create your initial password.'
              : recovery
                ? 'Reset your password for your member account.'
                : register
                  ? 'Create your member account.'
                  : 'Sign in to your member account.'
        }
      />
      {error && (
        <Notice>
          Incorrect email or password. Please try again.
        </Notice>
      )}
      <form className="space-y-5" onSubmit={e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (verify) {
          setSent(true);
          navigate({ to: '/portal/$role/$screen', params: { role: 'member', screen: 'dashboard' } });
          return;
        }
        if (setupPassword) {
          if (data.get('new') !== data.get('confirm')) {
            setSent(false);
            return;
          }
          setSent(true);
          navigate({ to: '/portal/$role/$screen', params: { role: 'member', screen: 'dashboard' } });
          return;
        }
        if (recovery || register) {
          setSent(true);
          return;
        }
        const email = String(data.get('email'));
        const password = String(data.get('password'));
        const user = demoUsers.find(u => u.email === email && u.password === password);
        if (!user) {
          setError(true);
          return;
        }
        setError(false);
        login(user);
        navigate({ to: '/portal/$role/$screen', params: { role: user.role, screen: navigation[user.role][0]?.id ?? 'dashboard' } });
      }}>
        {verify && (
          <Field label="Verification code">
            <input autoComplete="off" name="code" required maxLength={6} className={inputClass} placeholder="123456" />
          </Field>
        )}
        {setupPassword && (
          <>
            <Field label="New password">
              <input autoComplete="off" type="password" name="new" required minLength={8} className={inputClass} placeholder="••••••••" />
            </Field>
            <Field label="Confirm new password">
              <input autoComplete="off" type="password" name="confirm" required minLength={8} className={inputClass} placeholder="••••••••" />
            </Field>
          </>
        )}
        {!verify && !setupPassword && (
          <>
            {register && (
              <Field label="Display name">
                <input autoComplete="off" name="name" required className={inputClass} placeholder="Demo member" />
              </Field>
            )}
            <Field label="Email address">
              <input autoComplete="off" type="email" name="email" required className={inputClass} placeholder="member@example.com" />
            </Field>
            {!recovery && (
              <Field label="Demo password">
                <input type="password" autoComplete="off" name="password" required minLength={8} className={inputClass} placeholder="Use any demo password (8+ characters)" />
              </Field>
            )}
            {register && (
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input type="checkbox" required className="mt-1 accent-primary" />
                I understand this is a visual demonstration, not a real membership registration.
              </label>
            )}
          </>
        )}
        <Button type="submit" className="w-full">
          {verify ? 'Verify email' : setupPassword ? 'Set password' : recovery ? 'Preview recovery request' : register ? 'Preview registration' : 'Enter member demonstration'}
          <ArrowRight />
        </Button>
      </form>
      <div className="mt-8 border-t border-border pt-6">
        <p className="mb-4 text-xs font-semibold uppercase text-muted-foreground">Demo access</p>
        <p className="mb-3 text-xs text-muted-foreground">Fictional presentation-only credentials. Not secure for production use.</p>
        <table className="text-xs">
          <thead>
            <tr>
              <th className="text-left w-24 font-semibold text-muted-foreground">Role</th>
              <th className="text-left w-32 font-semibold text-muted-foreground">Email</th>
              <th className="text-left font-semibold text-muted-foreground">Password</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border py-2">
              <td className="text-muted-foreground">Member</td>
              <td className="text-muted-foreground">tariro@example.com</td>
              <td className="text-muted-foreground">member123</td>
            </tr>
            <tr className="border-t border-border py-2">
              <td className="text-muted-foreground">Staff</td>
              <td className="text-muted-foreground">samantha@example.com</td>
              <td className="text-muted-foreground">staff123</td>
            </tr>
            <tr className="border-t border-border py-2">
              <td className="text-muted-foreground">Finance</td>
              <td className="text-muted-foreground">david@example.com</td>
              <td className="text-muted-foreground">finance123</td>
            </tr>
            <tr className="border-t border-border py-2">
              <td className="text-muted-foreground">Admin</td>
              <td className="text-muted-foreground">admin@example.com</td>
              <td className="text-muted-foreground">admin123</td>
            </tr>
          </tbody>
        </table>
      </div>
      {sent && (
        <Notice>
          {verify
            ? 'Email verified. You can now sign in.'
            : setupPassword
              ? 'Password set. You can now sign in.'
              : recovery
                ? 'Recovery request previewed. No email was sent and no password was changed.'
                : 'Registration previewed. No account was created or confirmation email sent.'}
        </Notice>
      )}
      <div className="mt-6 flex flex-wrap justify-between gap-4 text-xs text-primary">
        {verify && (
          <>
            <Link to="/portal/$role/$screen" params={{ role: 'member', screen: 'login' }} onClick={() => navigate({ to: '/portal/$role/$screen', params: { role: 'member', screen: 'login' } })}>
              Back to login
            </Link>
            <Link to="/portal/$role/$screen" params={{ role: 'member', screen: 'setup-password' }} onClick={() => navigate({ to: '/portal/$role/$screen', params: { role: 'member', screen: 'setup-password' } })}>
              Set up password
            </Link>
          </>
        )}
        {setupPassword && (
          <>
            <Link to="/portal/$role/$screen" params={{ role: 'member', screen: 'login' }} onClick={() => navigate({ to: '/portal/$role/$screen', params: { role: 'member', screen: 'login' } })}>
              Back to login
            </Link>
          </>
        )}
        {!verify && !setupPassword && (
          <>
            <Link
              to="/portal/$role/$screen"
              params={{ role: 'member', screen: register || recovery ? 'login' : 'register' }}
              onClick={() => navigate({ to: '/portal/$role/$screen', params: { role: 'member', screen: register || recovery ? 'login' : 'register' } })}
            >
              {register || recovery ? 'Back to login' : 'Create a demo account'}
            </Link>
            {!recovery && (
              <Link
                to="/portal/$role/$screen"
                params={{ role: 'member', screen: 'recovery' }}
                onClick={() => navigate({ to: '/portal/$role/$screen', params: { role: 'member', screen: 'recovery' } })}
              >
                Forgot password?
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

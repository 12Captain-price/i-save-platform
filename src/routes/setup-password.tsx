import { createFileRoute } from '@tanstack/react-router';
import { PasswordSetup } from '@/components/auth/PasswordSetup';
export const Route = createFileRoute('/setup-password')({
  head: () => ({ meta: [{ title: 'Set your password — i-Save' }] }),
  component: PasswordSetup,
});

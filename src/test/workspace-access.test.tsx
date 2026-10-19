import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { canAccessWorkspace, demoUsers, type DemoUser } from '@/lib/portal/demo';
import { DemoProvider, useDemo } from '@/components/portal/DemoProvider';
import { AccountForm, AccountLayout } from '@/components/portal/AccountLayout';
import React from 'react';

vi.mock('@tanstack/react-router', () => {
  return {
    useNavigate: vi.fn(() => () => ({})),
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    createFileRoute: vi.fn(),
  };
});

const memberUser: DemoUser = {
  id: 'DU-1001',
  name: 'Tariro Moyo',
  role: 'member',
  workspaces: ['member'],
  permissions: ['view:own-savings', 'submit:applications', 'edit:own-profile'],
  email: 'tariro@example.com',
  password: 'member123',
};

const ordinaryStaffUser: DemoUser = {
  id: 'DU-2003',
  name: 'Grace Mhlanga',
  role: 'staff',
  workspaces: ['staff', 'finance', 'admin'],
  permissions: ['view:members', 'record:payments', 'review:applications', 'reply:support'],
  email: 'grace@example.com',
  password: 'staff123',
};

const financeAuthorisedStaff: DemoUser = {
  id: 'DU-2001',
  name: 'Samantha Khumalo',
  role: 'staff',
  workspaces: ['staff', 'finance', 'admin'],
  permissions: ['view:members', 'record:payments', 'review:applications', 'reply:support', 'verify:payments'],
  email: 'samantha@example.com',
  password: 'staff123',
};

const adminAuthorisedStaff: DemoUser = {
  id: 'DU-2002',
  name: 'David Moyo',
  role: 'finance',
  workspaces: ['finance', 'staff', 'admin'],
  permissions: ['view:ledger', 'verify:payments', 'reconcile:payments', 'export:reports', 'manage:settings'],
  email: 'david@example.com',
  password: 'finance123',
};

const adminUser: DemoUser = {
  id: 'DU-3001',
  name: 'Admin User',
  role: 'admin',
  workspaces: ['admin', 'staff', 'finance'],
  permissions: ['manage:staff', 'manage:roles', 'manage:plans', 'manage:announcements', 'manage:settings', 'view:audit'],
  email: 'admin@example.com',
  password: 'admin123',
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <DemoProvider>{children}</DemoProvider>;
}

function LoginTestForm() {
  const { login } = useDemo();
  const [error, setError] = React.useState(false);
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const email = String(data.get('email'));
        const password = String(data.get('password'));
        const user = demoUsers.find(u => u.email === email && u.password === password);
        if (!user) {
          setError(true);
          return;
        }
        setError(false);
        login(user);
      }}
    >
      <input name="email" />
      <input name="password" />
      <button type="submit">Sign in</button>
      {error && <p data-testid="login-error">Incorrect email or password.</p>}
    </form>
  );
}

describe('Workspace access control', () => {
  describe('Member restrictions', () => {
    it('member can access own workspace', () => {
      expect(canAccessWorkspace(memberUser, 'member')).toBe(true);
    });

    it('member cannot access staff workspace', () => {
      expect(canAccessWorkspace(memberUser, 'staff')).toBe(false);
    });

    it('member cannot access finance workspace', () => {
      expect(canAccessWorkspace(memberUser, 'finance')).toBe(false);
    });

    it('member cannot access admin workspace', () => {
      expect(canAccessWorkspace(memberUser, 'admin')).toBe(false);
    });
  });

  describe('Ordinary staff restrictions', () => {
    it('ordinary staff can access own workspace', () => {
      expect(canAccessWorkspace(ordinaryStaffUser, 'staff')).toBe(true);
    });

    it('ordinary staff cannot access finance workspace without permission', () => {
      expect(canAccessWorkspace(ordinaryStaffUser, 'finance')).toBe(false);
    });

    it('ordinary staff cannot access admin workspace without permission', () => {
      expect(canAccessWorkspace(ordinaryStaffUser, 'admin')).toBe(false);
    });

    it('ordinary staff cannot access member workspace', () => {
      expect(canAccessWorkspace(ordinaryStaffUser, 'member')).toBe(false);
    });
  });

  describe('Finance-authorised staff', () => {
    it('finance-authorised staff can access own workspace', () => {
      expect(canAccessWorkspace(financeAuthorisedStaff, 'staff')).toBe(true);
    });

    it('finance-authorised staff can access finance workspace', () => {
      expect(canAccessWorkspace(financeAuthorisedStaff, 'finance')).toBe(true);
    });

    it('finance-authorised staff cannot access admin workspace', () => {
      expect(canAccessWorkspace(financeAuthorisedStaff, 'admin')).toBe(false);
    });
  });

  describe('Admin-authorised staff', () => {
    it('finance role with admin permission can access own workspace', () => {
      expect(canAccessWorkspace(adminAuthorisedStaff, 'finance')).toBe(true);
    });

    it('finance role with admin permission can access admin workspace', () => {
      expect(canAccessWorkspace(adminAuthorisedStaff, 'admin')).toBe(true);
    });

    it('finance role with admin permission cannot access staff workspace', () => {
      expect(canAccessWorkspace(adminAuthorisedStaff, 'staff')).toBe(false);
    });
  });

  describe('Admin user', () => {
    it('admin can access all workspaces', () => {
      expect(canAccessWorkspace(adminUser, 'admin')).toBe(true);
      expect(canAccessWorkspace(adminUser, 'staff')).toBe(true);
      expect(canAccessWorkspace(adminUser, 'finance')).toBe(true);
      expect(canAccessWorkspace(adminUser, 'member')).toBe(true);
    });
  });

  describe('Demo login flow', () => {
    it('correct member credentials succeed without error', () => {
      render(
        <Wrapper>
          <LoginTestForm />
        </Wrapper>
      );
      const inputs = screen.getAllByRole('textbox');
      const emailInput = inputs[0] as HTMLInputElement;
      const passwordInput = inputs[1] as HTMLInputElement;
      const submitBtn = screen.getByRole('button', { name: 'Sign in' });

      fireEvent.change(emailInput, { target: { value: 'tariro@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'member123' } });
      fireEvent.click(submitBtn);

      expect(screen.queryByTestId('login-error')).not.toBeInTheDocument();
    });

    it('correct staff credentials succeed without error', () => {
      render(
        <Wrapper>
          <LoginTestForm />
        </Wrapper>
      );
      const inputs = screen.getAllByRole('textbox');
      const emailInput = inputs[0] as HTMLInputElement;
      const passwordInput = inputs[1] as HTMLInputElement;
      const submitBtn = screen.getByRole('button', { name: 'Sign in' });

      fireEvent.change(emailInput, { target: { value: 'samantha@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'staff123' } });
      fireEvent.click(submitBtn);

      expect(screen.queryByTestId('login-error')).not.toBeInTheDocument();
    });

    it('correct finance credentials succeed without error', () => {
      render(
        <Wrapper>
          <LoginTestForm />
        </Wrapper>
      );
      const inputs = screen.getAllByRole('textbox');
      const emailInput = inputs[0] as HTMLInputElement;
      const passwordInput = inputs[1] as HTMLInputElement;
      const submitBtn = screen.getByRole('button', { name: 'Sign in' });

      fireEvent.change(emailInput, { target: { value: 'david@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'finance123' } });
      fireEvent.click(submitBtn);

      expect(screen.queryByTestId('login-error')).not.toBeInTheDocument();
    });

    it('correct admin credentials succeed without error', () => {
      render(
        <Wrapper>
          <LoginTestForm />
        </Wrapper>
      );
      const inputs = screen.getAllByRole('textbox');
      const emailInput = inputs[0] as HTMLInputElement;
      const passwordInput = inputs[1] as HTMLInputElement;
      const submitBtn = screen.getByRole('button', { name: 'Sign in' });

      fireEvent.change(emailInput, { target: { value: 'admin@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'admin123' } });
      fireEvent.click(submitBtn);

      expect(screen.queryByTestId('login-error')).not.toBeInTheDocument();
    });

    it('incorrect credentials show error', () => {
      render(
        <Wrapper>
          <LoginTestForm />
        </Wrapper>
      );
      const inputs = screen.getAllByRole('textbox');
      const emailInput = inputs[0] as HTMLInputElement;
      const passwordInput = inputs[1] as HTMLInputElement;
      const submitBtn = screen.getByRole('button', { name: 'Sign in' });

      fireEvent.change(emailInput, { target: { value: 'wrong@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(submitBtn);

      expect(screen.getByTestId('login-error')).toBeInTheDocument();
    });

    it('empty email shows error', () => {
      render(
        <Wrapper>
          <LoginTestForm />
        </Wrapper>
      );
      const inputs = screen.getAllByRole('textbox');
      const emailInput = inputs[0] as HTMLInputElement;
      const passwordInput = inputs[1] as HTMLInputElement;
      const submitBtn = screen.getByRole('button', { name: 'Sign in' });

      fireEvent.change(passwordInput, { target: { value: 'member123' } });
      fireEvent.click(submitBtn);

      expect(screen.getByTestId('login-error')).toBeInTheDocument();
    });
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordPage from '../../src/components/auth/ForgotPasswordPage';

// T-FORGOT client coverage (docs/lab-03/tests.md): validation, safe no-leak
// failure, and the success path of the credential-verified reset screen.
// No email flow exists (excluded by the lab); this screen is the mockup's
// "Forgot password?" implemented within the allowed scope.

function postResponse(url: string, init?: RequestInit): Response | undefined {
  if (!url.includes('/api/auth/forgot-password')) return undefined;
  const body = JSON.parse(String(init?.body ?? '{}'));
  if (body.email === 'alpha@toktickit.test' && body.currentPassword === 'Requester123!') {
    return {
      ok: true,
      status: 200,
      json: async () => ({ changed: true, message: 'Password updated' }),
    } as unknown as Response;
  }
  return {
    ok: false,
    status: 401,
    json: async () => ({ error: 'Unable to update password with the details provided.' }),
  } as unknown as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('ForgotPasswordPage (T-FORGOT client)', () => {
  it('shows validation errors on empty submit and does not call the API', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    render(<ForgotPasswordPage />);

    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your current or initial password.')).toBeInTheDocument();
    expect(screen.getByText('Enter a new password.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the safe generic failure when credentials do not match (no leak)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      postResponse(String(input), init) ?? { ok: true, status: 200, json: async () => ({}) } as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText('Email address'), 'alpha@toktickit.test');
    await userEvent.type(screen.getByLabelText('Current or temporary password'), 'WrongPass1!');
    await userEvent.type(screen.getByLabelText(/^New Password/), 'FreshPass9#');
    await userEvent.type(screen.getByLabelText(/^Confirm New Password/), 'FreshPass9#');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(
      await screen.findByText(
        /We could not update that password. Check the details and try again, or contact your IT administrator./i,
      ),
    ).toBeInTheDocument();
    // The generic body text must never be rendered verbatim (it is identical
    // for unknown email / wrong password / inactive — no existence leak).
    expect(screen.queryByText(/details provided/i)).toBeNull();
  });

  it('updates the password and returns to sign in on success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        postResponse(String(input), init) ?? { ok: true, status: 200, json: async () => ({}) } as unknown as Response,
      );
      vi.stubGlobal('fetch', fetchMock);
      render(<ForgotPasswordPage />);

      await userEvent.type(screen.getByLabelText('Email address'), 'alpha@toktickit.test');
      await userEvent.type(screen.getByLabelText('Current or temporary password'), 'Requester123!');
      await userEvent.type(screen.getByLabelText(/^New Password/), 'FreshPass9#');
      await userEvent.type(screen.getByLabelText(/^Confirm New Password/), 'FreshPass9#');
      await userEvent.click(screen.getByRole('button', { name: /update password/i }));

      expect(
        await screen.findByText(/Password updated. You can now sign in with your new password./i),
      ).toBeInTheDocument();
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
        email: 'alpha@toktickit.test',
        currentPassword: 'Requester123!',
        newPassword: 'FreshPass9#',
        confirmPassword: 'FreshPass9#',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('links back to sign in and warns that no reset email is sent', async () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByText(/does not send password-reset emails/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '#/login');
  });
});

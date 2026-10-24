'use client';

export function SignOutButton() {
  async function signOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/');
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-lg font-semibold text-text hover:border-faint"
    >
      Sign out
    </button>
  );
}

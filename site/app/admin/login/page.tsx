import { redirect } from 'next/navigation';
import { Geist_Mono } from 'next/font/google';
import { checkCredentials, isAdmin, startAdminSession } from '../_lib/auth';

const mono = Geist_Mono({ subsets: ['latin'], weight: ['400'] });

async function login(formData: FormData) {
  'use server';
  const user = String(formData.get('user') ?? '');
  const pass = String(formData.get('pass') ?? '');
  if (!checkCredentials(user, pass)) redirect('/admin/login?error=1');
  await startAdminSession();
  redirect('/admin');
}

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect('/admin');
  const { error } = await searchParams;
  const field =
    'h-11 w-full rounded-[10px] border border-line-strong bg-bg px-3.5 text-[14px] text-text outline-none placeholder:text-faint focus:border-accent';
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 text-text">
      <form action={login} className="flex w-full max-w-[340px] flex-col gap-3 rounded-[12px] bg-surface p-7">
        <span className={`${mono.className} text-[12px] text-muted`}>Fixie · admin</span>
        <h1 className="m-0 mb-2 text-[24px] font-light tracking-[-0.02em]">Operator console</h1>
        <input name="user" placeholder="Username" autoComplete="username" className={field} autoFocus />
        <input name="pass" type="password" placeholder="Password" autoComplete="current-password" className={field} />
        {error && <span className="text-[13px] text-fault">Wrong username or password.</span>}
        <button className="mt-2 h-11 rounded-full bg-button text-[14px] font-medium text-button-text hover:bg-white">Sign in</button>
      </form>
    </main>
  );
}

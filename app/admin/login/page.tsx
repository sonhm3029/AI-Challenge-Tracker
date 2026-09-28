import { loginAction } from "@/app/admin/actions";

export const metadata = { title: "Admin login", robots: { index: false } };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const resolved = await searchParams;
  const hasError = resolved.error === "1";

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 py-16">
      <h1 className="text-lg font-semibold">Admin login</h1>
      <form action={loginAction} className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          required
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        {hasError && <p className="text-sm text-red-600">Incorrect password.</p>}
        <button type="submit" className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900">
          Sign in
        </button>
      </form>
    </div>
  );
}

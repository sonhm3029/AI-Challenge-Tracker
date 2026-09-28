import Link from "next/link";
import { logoutAction } from "@/app/admin/actions";

export const metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <nav className="flex gap-4 text-sm">
          <Link href="/admin" className="font-semibold">
            Admin
          </Link>
          <Link href="/admin/challenges" className="text-stone-600 hover:text-inherit dark:text-stone-300">
            Challenges
          </Link>
          <Link href="/admin/sources" className="text-stone-600 hover:text-inherit dark:text-stone-300">
            Sources
          </Link>
          <Link href="/admin/crawl-runs" className="text-stone-600 hover:text-inherit dark:text-stone-300">
            Crawl runs
          </Link>
        </nav>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-stone-500 hover:text-inherit">
            Sign out
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}

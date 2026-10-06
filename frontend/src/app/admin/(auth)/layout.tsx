import Link from "next/link";

/**
 * Unauthenticated Admin flows (forgot password, reset password, invitation setup). These must
 * never render the operator shell — a signed-out visitor has no session to build a sidebar from,
 * and the chrome would imply access that does not exist yet.
 */
export default function AdminAuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 py-16">
      <Link href="/admin" className="mb-10 text-lg font-bold tracking-[-0.035em]">
        OWNLINE
        <span className="ml-1 text-[9px] font-medium uppercase tracking-[0.12em]">Ops</span>
      </Link>
      {children}
    </div>
  );
}

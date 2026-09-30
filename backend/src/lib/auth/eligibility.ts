export function accountEligible(account: { status: string; deletedAt: Date | null } | undefined): boolean {
  return !!account && account.status === "ACTIVE" && account.deletedAt === null;
}

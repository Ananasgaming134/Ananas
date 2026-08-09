import Link from "next/link";
import { requireMember } from "@/lib/session";
import DashboardNav from "@/components/DashboardNav";
import SignOutButton from "@/components/SignOutButton";
import RoleBadge from "@/components/RoleBadge";
import AnimatedBackground from "@/components/AnimatedBackground";
import { SITE_NAME } from "@/lib/constants";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();

  return (
    <div className="relative min-h-screen">
      <AnimatedBackground />

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="card-glass sticky top-6 flex h-[calc(100vh-3rem)] flex-col p-4">
            <Link href="/" className="mb-6 flex items-center gap-2 px-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-xs font-bold text-accent">
                OL
              </div>
              <span className="text-sm font-semibold">{SITE_NAME}</span>
            </Link>

            <DashboardNav role={member.role} />

            <div className="mt-auto space-y-3 border-t border-border pt-4">
              <div className="flex items-center gap-2 px-1">
                {member.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.avatarUrl}
                    alt={member.displayName}
                    className="h-8 w-8 rounded-full border border-border"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-2 text-xs">
                    {member.displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.displayName}</p>
                  <RoleBadge role={member.role} />
                </div>
              </div>
              <SignOutButton />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="card-glass mb-4 p-3 lg:hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{member.displayName}</p>
                <RoleBadge role={member.role} />
              </div>
              <SignOutButton />
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <DashboardNav role={member.role} />
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

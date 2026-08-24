import Link from "next/link";
import { requireMember } from "@/lib/session";
import { getRuleSet } from "@/lib/rules";
import RulesView from "@/components/RulesView";
import { hasAtLeastRole, ROLES } from "@/lib/constants";

export default async function RegelwerkPage() {
  const member = await requireMember();
  const rules = await getRuleSet();
  const canEdit = hasAtLeastRole(member.role, ROLES.OWNER);

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted/70">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          Verbindlich
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold sm:text-3xl">Regelwerk</h1>
          {canEdit && (
            <Link
              href="/dashboard/verwaltung/regelwerk"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Bearbeiten
            </Link>
          )}
        </div>
        {rules?.updatedAt && (
          <p className="mt-2 text-sm text-muted">
            Zuletzt aktualisiert am {rules.updatedAt.toLocaleDateString("de-DE")} — gilt ab
            Veröffentlichung.
          </p>
        )}
      </div>

      <div className="fade-up card p-6">
        {rules?.content ? (
          <RulesView content={rules.content} />
        ) : (
          <p className="text-sm text-muted">
            Es ist noch kein Regelwerk hinterlegt.
            {canEdit && " Lege es über „Bearbeiten“ an."}
          </p>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireMember } from "@/lib/session";
import { getText } from "@/lib/rules";
import RulesView from "@/components/RulesView";
import { hasAtLeastRole, ROLES } from "@/lib/constants";

export default async function InfoPage() {
  const member = await requireMember();
  const text = await getText("info");
  const canEdit = hasAtLeastRole(member.role, ROLES.OWNER);

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted/70">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          Gut zu wissen
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold sm:text-3xl">Über das LeihCenter</h1>
          {canEdit && (
            <Link
              href="/dashboard/verwaltung/info"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Bearbeiten
            </Link>
          )}
        </div>
        {text?.updatedAt && (
          <p className="mt-2 text-sm text-muted">
            Zuletzt aktualisiert am {text.updatedAt.toLocaleDateString("de-DE")}.
          </p>
        )}
      </div>

      <div className="fade-up card p-6">
        {text?.content ? (
          <RulesView content={text.content} />
        ) : (
          <p className="text-sm text-muted">
            Es ist noch kein Text hinterlegt.
            {canEdit && " Lege ihn über „Bearbeiten“ an."}
          </p>
        )}
      </div>
    </div>
  );
}

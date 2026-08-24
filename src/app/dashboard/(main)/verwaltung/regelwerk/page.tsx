import { requireMember } from "@/lib/session";
import { getRuleSet } from "@/lib/rules";
import RulesEditor from "@/components/RulesEditor";
import { RULES_CHANNEL_ID } from "@/lib/discord";
import { ROLES } from "@/lib/constants";

export default async function RegelwerkVerwaltungPage() {
  await requireMember(ROLES.OWNER);
  const rules = await getRuleSet();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Regelwerk bearbeiten</h1>
        <p className="mt-1 text-sm text-muted">
          Beim Speichern wird der Text sofort auf der Website aktualisiert und in{" "}
          <span className="font-mono text-foreground">#Regelwerk</span> gespiegelt. Dort wird
          immer <span className="text-foreground">dieselbe Nachricht</span> bearbeitet — es
          entsteht kein neuer Post.
          {rules?.discordMessageId ? "" : " Beim ersten Speichern wird die Nachricht angelegt."}
        </p>
        <p className="mt-1 text-xs text-muted">Kanal-ID: {RULES_CHANNEL_ID}</p>
      </div>

      <RulesEditor initialContent={rules?.content ?? ""} />
    </div>
  );
}

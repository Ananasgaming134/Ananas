import { requireMember } from "@/lib/session";
import { getText } from "@/lib/rules";
import RulesEditor from "@/components/RulesEditor";
import PageHeader from "@/components/PageHeader";
import { INFO_CHANNEL_ID } from "@/lib/discord";
import { ROLES } from "@/lib/constants";

export default async function InfoVerwaltungPage() {
  await requireMember(ROLES.OWNER);
  const text = await getText("info");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Über das LeihCenter bearbeiten"
        description={
          <>
            Der Text erklärt Ablauf, Voraussetzungen und Preise. Beim Speichern wird er sofort auf
            der Website aktualisiert und in den Info-Kanal gespiegelt. Dort werden immer{" "}
            <span className="text-foreground">dieselben Nachrichten</span> bearbeitet — es entsteht
            kein neuer Post.
            {text?.discordMessageId ? "" : " Beim ersten Speichern werden die Nachrichten angelegt."}
            <span className="mt-1 block text-xs text-muted">Kanal-ID: {INFO_CHANNEL_ID}</span>
          </>
        }
      />

      <RulesEditor initialContent={text?.content ?? ""} schluessel="info" />
    </div>
  );
}

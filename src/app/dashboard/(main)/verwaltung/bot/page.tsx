import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  addBotDeployment,
  checkSubscriptionReminders,
  refreshBotPanel,
  registerSlashCommand,
  removeBotDeployment,
  setupTicketPanel,
  updateTicketConfig,
} from "@/app/actions/bot";
import { ROLES } from "@/lib/constants";

export default async function BotVerwaltenPage() {
  await requireMember(ROLES.OWNER);
  const deployments = await prisma.botDeployment.findMany({ orderBy: { createdAt: "desc" } });

  const clientId = process.env.AUTH_DISCORD_ID ?? "";
  const inviteUrl = clientId
    ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=379968&scope=bot%20applications.commands`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Discord-Server &amp; Ausleih-Panel</h1>
        <p className="mt-1 text-sm text-muted">
          Hier legst du fest, auf welchen Discord-Servern der Bot ein
          sich selbst aktualisierendes Item-Panel pflegt, in welchem Kanal,
          und welche Rolle dort ausleihen darf.
        </p>
      </div>

      {inviteUrl && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold">1. Bot zu einem neuen Server einladen</h2>
          <p className="mt-1.5 text-sm text-muted">
            Muss einmalig von jemandem mit &bdquo;Server verwalten&ldquo; auf
            dem jeweiligen Server bestätigt werden &ndash; das kann nicht
            automatisch passieren.
          </p>
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs font-medium text-accent transition hover:bg-surface"
          >
            Einladungslink öffnen →
          </a>
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold">2. Server konfigurieren</h2>
        <form action={addBotDeployment} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="guildId">
              Server-ID (Guild-ID)
            </label>
            <input
              id="guildId"
              name="guildId"
              required
              inputMode="numeric"
              placeholder="z.B. 1469711700554027130"
              className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="channelId">
              Kanal-ID fürs Panel
            </label>
            <input
              id="channelId"
              name="channelId"
              required
              inputMode="numeric"
              placeholder="z.B. 1469711701535490081"
              className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="borrowRoleId">
              Rollen-ID zum Ausleihen
            </label>
            <input
              id="borrowRoleId"
              name="borrowRoleId"
              required
              inputMode="numeric"
              placeholder="z.B. Kunde-Rolle auf diesem Server"
              className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="statusChannelId">
              Kanal-ID für &bdquo;Aktuell ausgeliehen&ldquo; (optional)
            </label>
            <input
              id="statusChannelId"
              name="statusChannelId"
              inputMode="numeric"
              placeholder="Leer lassen, wenn nicht gewünscht"
              className="w-full max-w-md rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Speichern &amp; Panel posten
            </button>
          </div>
        </form>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-2/60 text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Server-ID</th>
              <th className="px-4 py-3 font-medium">Kanal-ID</th>
              <th className="px-4 py-3 font-medium">Ausleih-Rolle</th>
              <th className="px-4 py-3 font-medium">Panel-Status</th>
              <th className="px-4 py-3 font-medium">Status-Panel</th>
              <th className="px-4 py-3 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {deployments.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 font-mono text-xs">{d.guildId}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{d.channelId}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{d.borrowRoleId}</td>
                <td className="px-4 py-3">
                  {d.panelMessageId ? (
                    <span className="inline-flex items-center rounded-full border border-accent-2/40 bg-accent-2/10 px-2.5 py-0.5 text-xs font-medium text-accent-2">
                      gepostet
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-500">
                      noch nicht gepostet
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {!d.statusChannelId ? (
                    <span className="text-xs text-muted">nicht eingerichtet</span>
                  ) : d.statusMessageId ? (
                    <span className="inline-flex items-center rounded-full border border-accent-2/40 bg-accent-2/10 px-2.5 py-0.5 text-xs font-medium text-accent-2">
                      gepostet
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-500">
                      noch nicht gepostet
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <form action={refreshBotPanel.bind(null, d.id)}>
                      <button
                        type="submit"
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2"
                      >
                        Panel aktualisieren
                      </button>
                    </form>
                    <form action={registerSlashCommand.bind(null, d.id)}>
                      <button
                        type="submit"
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2"
                      >
                        Slash-Befehle registrieren
                      </button>
                    </form>
                    <form action={removeBotDeployment.bind(null, d.id)}>
                      <button
                        type="submit"
                        className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20"
                      >
                        Entfernen
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {deployments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Noch keine Server konfiguriert.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {deployments.length > 0 && (
        <div className="card space-y-5 p-5">
          <div>
            <h2 className="text-sm font-semibold">3. Ticket-System</h2>
            <p className="mt-1.5 text-sm text-muted">
              Bot erstellt bei jedem neuen Ticket automatisch einen privaten Kanal, sichtbar nur für
              die eröffnende Person, die hier festgelegten Rollen und den Owner. Das Panel selbst
              (mit „Support“/„Bewerbung“-Buttons) bleibt für die Kunde-Rolle unsichtbar, bis du es
              unten freischaltest.
            </p>
          </div>

          {deployments.map((d) => (
            <div key={d.id} className="space-y-4 rounded-xl border border-border bg-surface/60 p-4">
              <p className="font-mono text-xs text-muted">Server {d.guildId}</p>

              <form action={setupTicketPanel.bind(null, d.id)} className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor={`ticketPanelChannelId-${d.id}`}>
                    Kanal-ID fürs Ticket-Panel
                  </label>
                  <input
                    id={`ticketPanelChannelId-${d.id}`}
                    name="ticketPanelChannelId"
                    defaultValue={d.ticketPanelChannelId ?? ""}
                    inputMode="numeric"
                    placeholder="Kanal-ID"
                    className="w-56 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-xs font-medium text-accent transition hover:bg-surface"
                >
                  {d.ticketPanelMessageId ? "Panel aktualisieren" : "Panel einrichten"}
                </button>
              </form>

              <form action={updateTicketConfig.bind(null, d.id)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor={`supportClaimRoleIds-${d.id}`}>
                    Rollen-IDs, die Support-Tickets claimen dürfen
                  </label>
                  <input
                    id={`supportClaimRoleIds-${d.id}`}
                    name="supportClaimRoleIds"
                    defaultValue={d.supportClaimRoleIds ?? ""}
                    placeholder="mehrere per Komma trennen"
                    className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor={`bewerbungClaimRoleIds-${d.id}`}>
                    Rollen-IDs, die Bewerbungs-Tickets claimen dürfen
                  </label>
                  <input
                    id={`bewerbungClaimRoleIds-${d.id}`}
                    name="bewerbungClaimRoleIds"
                    defaultValue={d.bewerbungClaimRoleIds ?? ""}
                    placeholder="mehrere per Komma trennen"
                    className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
                  />
                </div>
                <p className="text-xs text-muted sm:col-span-2">
                  Der Owner kann immer alle Tickets claimen, unabhängig von dieser Liste.
                </p>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="ticketsVisibleToCustomers"
                    defaultChecked={d.ticketsVisibleToCustomers}
                    className="h-4 w-4 rounded border-border accent-accent"
                  />
                  Ticket-Panel für die Kunde-Rolle sichtbar machen
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-black transition hover:brightness-110"
                  >
                    Speichern
                  </button>
                </div>
              </form>
            </div>
          ))}
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-sm font-semibold">4. Abo-Ablauf jetzt prüfen</h2>
        <p className="mt-1.5 text-sm text-muted">
          Postet für jeden Kunden, dessen Abo abgelaufen ist oder in den
          nächsten 3 Tagen abläuft, eine Erinnerung mit Verlängern-Buttons
          (1/3/6 Monate) in den Discord-Abo-Kanal. Es gibt noch keinen
          automatischen, wiederkehrenden Check &ndash; das hier musst du
          bis auf Weiteres manuell anstoßen.
        </p>
        <form action={checkSubscriptionReminders} className="mt-3">
          <button
            type="submit"
            className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs font-medium text-accent transition hover:bg-surface"
          >
            Jetzt prüfen &amp; Erinnerungen posten
          </button>
        </form>
      </div>

      <div className="card p-5 text-xs text-muted">
        <p className="font-medium text-foreground/80">Hinweis</p>
        <p className="mt-1">
          Slash-Befehle (z.B. <code className="text-accent">/akte</code>,{" "}
          <code className="text-accent">/setup</code>) und Buttons im Panel
          reagieren erst, sobald diese Seite öffentlich im Internet
          erreichbar ist &ndash; Discord muss die &bdquo;Interactions
          Endpoint URL&ldquo; per HTTPS erreichen können, das geht technisch
          nicht rein lokal. Die Konfiguration hier funktioniert aber schon
          jetzt, das Panel wird bereits gepostet und bei jeder Änderung
          aktualisiert.
        </p>
        <p className="mt-2">
          Sobald das funktioniert: Mit{" "}
          <code className="text-accent">/setup item-panel</code> (optional
          mit Rollen-Option bei Ersteinrichtung) bzw.{" "}
          <code className="text-accent">/setup status-panel</code> kann der
          Owner die Panels direkt im gewünschten Kanal in Discord einrichten
          &ndash; ohne diese Seite hier zu öffnen.
        </p>
      </div>
    </div>
  );
}

import { borrowItem, returnLoan } from "@/app/actions/loans";
import LoanCountdown from "@/components/LoanCountdown";
import ReborrowCooldown from "@/components/ReborrowCooldown";
import AvailabilityBadge from "@/components/AvailabilityBadge";
import FavoriteStar from "@/components/FavoriteStar";

export type ItemCardItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  quantityTotal: number;
  unavailable: boolean;
  unavailableReason: string | null;
  category?: { name: string } | null;
};

export type ItemCardLage = {
  /** Wie viele Stueck aktuell frei sind. */
  available: number;
  /** Die eigene laufende Ausleihe dieses Items, falls vorhanden. */
  myLoan: { id: string; dueAt: Date | null } | null;
  /** Ende der 30-Minuten-Pause nach eigener Rueckgabe, falls sie noch laeuft. */
  cooldownEnd: Date | null;
  favorit: boolean;
};

export type ItemCardSperren = {
  gesperrt: boolean;
  pausiert: boolean;
  ohneAbo: boolean;
  unverifiziert: boolean;
};

/**
 * Eine Item-Kachel im Kundenbereich. Wird an drei Stellen gebraucht - in den
 * Favoriten ganz oben, in den Kategorie-Gruppen darunter und im Profil -
 * deshalb liegt sie hier statt dreimal im Seiten-Code.
 *
 * Die Reihenfolge der Faelle ist bewusst: erst was das Item selbst blockiert
 * (gesperrt), dann die eigene laufende Ausleihe, dann was am Konto haengt.
 */
export default function ItemCard({
  item,
  lage,
  sperren,
  zeigeKategorie,
}: {
  item: ItemCardItem;
  lage: ItemCardLage;
  sperren: ItemCardSperren;
  zeigeKategorie?: boolean;
}) {
  const { available, myLoan, cooldownEnd, favorit } = lage;
  const inCooldown = Boolean(cooldownEnd && cooldownEnd > new Date());

  return (
    <div className="card card-hover flex flex-col overflow-hidden">
      <div className="relative flex aspect-[4/5] w-full items-center justify-center bg-surface-2 p-3">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            Kein Bild
          </div>
        )}
        <FavoriteStar itemId={item.id} favorit={favorit} itemName={item.name} />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{item.name}</h3>
            {zeigeKategorie && item.category && (
              <p className="mt-0.5 text-[11px] text-muted">{item.category.name}</p>
            )}
          </div>
          <div className="shrink-0">
            {item.unavailable ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
                <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
                gesperrt
              </span>
            ) : (
              <AvailabilityBadge available={available} total={item.quantityTotal} />
            )}
          </div>
        </div>

        <div className="mt-auto pt-4">
          {item.unavailable ? (
            <div className="space-y-1">
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                Derzeit nicht ausleihbar
              </button>
              {item.unavailableReason && (
                <p className="text-center text-[11px] text-muted">{item.unavailableReason}</p>
              )}
            </div>
          ) : myLoan ? (
            <>
              <p className="mb-2 text-center text-xs">
                {myLoan.dueAt ? (
                  <LoanCountdown dueAt={myLoan.dueAt} />
                ) : (
                  <span className="text-muted">Ausgeliehen</span>
                )}
              </p>
              <form action={returnLoan.bind(null, myLoan.id)}>
                <button
                  type="submit"
                  className="w-full rounded-lg border border-accent-2/40 bg-accent-2/10 px-3 py-2 text-sm font-medium text-accent-2 transition hover:bg-accent-2/20"
                >
                  Zurückgeben
                </button>
              </form>
            </>
          ) : sperren.gesperrt ? (
            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              Gesperrt
            </button>
          ) : sperren.pausiert ? (
            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-border px-3 py-2 text-sm text-muted"
            >
              Abo pausiert
            </button>
          ) : sperren.ohneAbo ? (
            <a
              href="/dashboard/abo"
              className="block w-full rounded-lg border border-border px-3 py-2 text-center text-sm text-muted transition hover:bg-surface-2"
            >
              Kein aktives Abo
            </a>
          ) : sperren.unverifiziert ? (
            <a
              href="/dashboard/akte"
              className="block w-full rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-center text-sm text-yellow-500 transition hover:bg-yellow-500/20"
            >
              Verifizierung nötig
            </a>
          ) : inCooldown && cooldownEnd ? (
            <div className="space-y-2">
              <p className="text-center text-xs text-muted">
                <ReborrowCooldown until={cooldownEnd} />
              </p>
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-border px-3 py-2 text-sm text-muted"
              >
                Ausleihen
              </button>
            </div>
          ) : available > 0 ? (
            <form action={borrowItem.bind(null, item.id)}>
              <button
                type="submit"
                className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black transition hover:brightness-110"
              >
                Ausleihen
              </button>
            </form>
          ) : (
            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-border px-3 py-2 text-sm text-muted"
            >
              Nicht verfügbar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

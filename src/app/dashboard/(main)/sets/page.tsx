import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSetsWithAvailability, MAX_SETS, MAX_SET_ITEMS } from "@/lib/itemSets";
import SetCard from "@/components/SetCard";
import CreateSetForm from "@/components/CreateSetForm";

export default async function SetsPage() {
  const member = await requireMember();

  const [sets, items] = await Promise.all([
    getSetsWithAvailability(member.id),
    prisma.item.findMany({
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, category: { select: { name: true } } },
    }),
  ]);

  const auswahl = items.map((i) => ({ id: i.id, name: i.name, kategorie: i.category?.name ?? null }));

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted/70">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          Deine Zusammenstellungen
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Meine Sets</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Stell dir deine Ausrüstung einmal zusammen und leih sie danach mit einem Klick am Stück
          aus. Bis zu {MAX_SET_ITEMS} Items pro Set, bis zu {MAX_SETS} Sets. Ist etwas gerade nicht
          frei, siehst du das vorher — du kannst dann trotzdem den Rest nehmen.
        </p>
      </div>

      {sets.length < MAX_SETS && (
        <div className="fade-up card p-5">
          <h2 className="mb-3 text-sm font-semibold">Neues Set</h2>
          <CreateSetForm />
        </div>
      )}

      {sets.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          Du hast noch kein Set. Leg oben eins an — zum Beispiel „Mining“ oder „PvP“.
        </div>
      ) : (
        <div className="space-y-4">
          {sets.map((set) => (
            <SetCard key={set.id} set={set} alleItems={auswahl} />
          ))}
        </div>
      )}
    </div>
  );
}

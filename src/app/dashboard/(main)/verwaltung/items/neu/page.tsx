import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createItem } from "@/app/actions/items";
import ItemForm from "@/components/ItemForm";
import { ROLES } from "@/lib/constants";

export default async function NeuesItemPage() {
  await requireMember(ROLES.OWNER);
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Neues Item anlegen</h1>
        <p className="mt-1 text-sm text-muted">
          Wähle idealerweise das passende Item von opsucht.net und hinterlege
          Bild sowie Durchschnittspreis.
        </p>
      </div>
      <ItemForm action={createItem} submitLabel="Item anlegen" categories={categories} />
    </div>
  );
}

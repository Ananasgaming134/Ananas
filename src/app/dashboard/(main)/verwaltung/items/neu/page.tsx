import PageHeader from "@/components/PageHeader";
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
      <PageHeader
        title="Neues Item anlegen"
        description="Wähle idealerweise das passende Item von opsucht.net und hinterlege Bild sowie Durchschnittspreis."
      />
      <ItemForm action={createItem} submitLabel="Item anlegen" categories={categories} />
    </div>
  );
}

import PageHeader from "@/components/PageHeader";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { updateItem } from "@/app/actions/items";
import ItemForm from "@/components/ItemForm";
import { ROLES } from "@/lib/constants";

export default async function ItemBearbeitenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireMember(ROLES.OWNER);
  const { id } = await params;

  const [item, categories] = await Promise.all([
    prisma.item.findUnique({ where: { id } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!item) notFound();

  const boundAction = updateItem.bind(null, item.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Verwaltung" title="Item bearbeiten" description={item.name} />
      <ItemForm
        action={boundAction}
        initial={item}
        submitLabel="Änderungen speichern"
        categories={categories}
      />
    </div>
  );
}

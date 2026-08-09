import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";

export default async function MeineAktePage() {
  const member = await requireMember();
  redirect(`/dashboard/akte/${member.id}`);
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import AnimatedBackground from "@/components/AnimatedBackground";
import SignOutButton from "@/components/SignOutButton";
import { SITE_NAME } from "@/lib/constants";

export default async function OnboardingPage() {
  const member = await requireMember();
  if (member.minecraftName) redirect("/dashboard");

  async function saveMinecraftName(formData: FormData) {
    "use server";
    const current = await requireMember();
    const minecraftName = String(formData.get("minecraftName") ?? "").trim();
    if (!minecraftName || minecraftName.length > 32) return;

    await prisma.member.update({
      where: { id: current.id },
      data: { minecraftName },
    });
    await logAction({
      actorId: current.id,
      targetId: current.id,
      action: "MINECRAFT_NAME_SET",
      details: `Minecraft-Name hinterlegt: ${minecraftName}`,
    });
    redirect("/dashboard");
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6">
      <AnimatedBackground />

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-xs font-bold text-accent">
          OL
        </div>
        <span className="text-sm font-semibold">{SITE_NAME}</span>
      </div>

      <div className="w-full max-w-md">
        <div className="card-glass p-6 sm:p-8">
          <h1 className="text-lg font-semibold">Fast geschafft, {member.displayName}</h1>
          <p className="mt-2 text-sm text-muted">
            Bevor du das LeihCenter nutzen kannst, hinterlege bitte deinen
            Minecraft-Namen. Er wird dauerhaft in deiner Mitglieder-Akte
            gespeichert &ndash; danach geht es direkt zu deinem Dashboard.
          </p>

          <form action={saveMinecraftName} className="mt-6 space-y-4">
            <div>
              <label htmlFor="minecraftName" className="mb-1.5 block text-xs font-medium text-muted">
                Minecraft-Name
              </label>
              <input
                id="minecraftName"
                name="minecraftName"
                required
                autoFocus
                maxLength={32}
                placeholder="z.B. Steve123"
                className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Speichern und weiter
            </button>
          </form>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <Link href="/" className="hover:underline">
            Zurück zur Startseite
          </Link>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import AnimatedBackground from "@/components/AnimatedBackground";
import { AUTH_DISCORD_SERVER_NAME, SITE_NAME } from "@/lib/constants";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.memberId) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <AnimatedBackground />

      <div className="card-glass w-full max-w-md p-8 sm:p-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface text-2xl font-bold text-accent">
            OL
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{SITE_NAME}</h1>
          <p className="mt-2 text-sm text-muted">
            Anmeldung ausschliesslich per Discord-Account mit passender Rolle
            auf dem Discord-Server &bdquo;{AUTH_DISCORD_SERVER_NAME}&ldquo;.
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#5865F2] px-5 py-3.5 font-medium text-white transition hover:brightness-110"
          >
            <svg viewBox="0 0 127.14 96.36" className="h-5 w-5 fill-white">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
            </svg>
            Mit Discord anmelden
          </button>
        </form>

        <div className="mt-6 space-y-2 rounded-lg border border-border bg-surface/60 p-4 text-xs text-muted">
          <p className="font-medium text-foreground/80">Zugriff nur mit passender Rolle</p>
          <p>
            Zugang erhalten ausschliesslich Discord-Mitglieder mit der Rolle{" "}
            <span className="text-accent">Kunde LeihCenter</span>,{" "}
            <span className="text-accent">Aufsichtsperson</span> oder{" "}
            <span className="text-accent">Owner</span> auf dem Discord-Server &bdquo;{AUTH_DISCORD_SERVER_NAME}&ldquo;.
          </p>
        </div>
      </div>
    </main>
  );
}

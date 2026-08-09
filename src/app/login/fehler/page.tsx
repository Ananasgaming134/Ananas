import Link from "next/link";
import AnimatedBackground from "@/components/AnimatedBackground";
import { AUTH_DISCORD_SERVER_NAME, SITE_NAME } from "@/lib/constants";

export default function LoginFehlerPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <AnimatedBackground />

      <div className="card-glass w-full max-w-md p-8 sm:p-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/40 bg-danger/10 text-2xl text-danger">
          !
        </div>
        <h1 className="text-xl font-semibold">Zugriff verweigert</h1>
        <p className="mt-3 text-sm text-muted">
          Dein Discord-Account hat auf dem Discord-Server &bdquo;{AUTH_DISCORD_SERVER_NAME}&ldquo; keine der für{" "}
          {SITE_NAME} erforderlichen Rollen (Kunde LeihCenter, Aufsichtsperson
          oder Owner) &ndash; oder deine Freigabe wurde entzogen.
        </p>
        <p className="mt-2 text-sm text-muted">
          Melde dich bei einer Aufsichtsperson, falls du glaubst, dass das ein
          Irrtum ist.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl border border-border px-5 py-2.5 text-sm font-medium transition hover:bg-surface-2"
        >
          Zurück zur Startseite
        </Link>
      </div>
    </main>
  );
}

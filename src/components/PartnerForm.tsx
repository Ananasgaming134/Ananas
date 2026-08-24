"use client";

import { useActionState, useState } from "react";
import { createPartner, updatePartner, type FormState } from "@/app/actions/partners";

const initialState: FormState = null;

type Partner = {
  id: string;
  name: string;
  description: string | null;
  discordUrl: string | null;
  bannerUrl: string | null;
  avatarUrl: string | null;
  sortOrder: number;
  active: boolean;
};

const feldClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2";

const MAX_MB = 5;
const ERLAUBT = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Formular fuer eine Visitenkarte. Wird zweimal verwendet: einmal leer zum
 * Anlegen, einmal je bestehendem Eintrag zum Bearbeiten. Bilder werden direkt
 * hochgeladen; ein bereits hinterlegtes Bild bleibt, solange kein neues
 * gewaehlt und der Haken zum Entfernen nicht gesetzt wird.
 */
export default function PartnerForm({ partner }: { partner?: Partner }) {
  const bearbeiten = Boolean(partner);
  const [state, formAction, pending] = useActionState(
    bearbeiten ? updatePartner : createPartner,
    initialState
  );

  // Sofortige Rueckmeldung schon beim Auswaehlen der Datei - wer ein zu
  // grosses Bild nimmt, soll das nicht erst nach dem Absenden erfahren.
  const [bildFehler, setBildFehler] = useState<Record<string, string>>({});

  function pruefeDatei(feld: string, label: string, datei: File | null) {
    let meldung = "";
    if (datei) {
      if (!ERLAUBT.includes(datei.type)) {
        meldung = `${label}: Dieses Format geht nicht. Nimm PNG, JPG, WEBP oder GIF.`;
      } else if (datei.size > MAX_MB * 1024 * 1024) {
        meldung = `${label}: Das Bild ist ${(datei.size / 1024 / 1024).toFixed(1)} MB groß — erlaubt sind ${MAX_MB} MB.`;
      }
    }
    setBildFehler((alt) => {
      const neu = { ...alt };
      if (meldung) neu[feld] = meldung;
      else delete neu[feld];
      return neu;
    });
  }

  const fehlerListe = Object.values(bildFehler);

  return (
    <form action={formAction} className="space-y-4">
      {partner && <input type="hidden" name="id" value={partner.id} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Name *</span>
          <input
            name="name"
            required
            defaultValue={partner?.name ?? ""}
            placeholder="Name der Kooperation"
            className={feldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Discord-Einladung</span>
          <input
            name="discordUrl"
            type="url"
            defaultValue={partner?.discordUrl ?? ""}
            placeholder="https://discord.gg/..."
            className={feldClass}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Text unter dem Namen</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={partner?.description ?? ""}
          placeholder="Steht auf der Karte direkt unter dem Namen — ein Satz reicht."
          className={feldClass}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <BildFeld
          label="Banner (breit, oben auf der Karte)"
          name="banner"
          entfernenName="bannerEntfernen"
          vorhanden={partner?.bannerUrl ?? null}
          fehler={bildFehler.banner}
          onDatei={(datei) => pruefeDatei("banner", "Banner", datei)}
          breit
        />
        <BildFeld
          label="Profilbild (rund)"
          name="avatar"
          entfernenName="avatarEntfernen"
          vorhanden={partner?.avatarUrl ?? null}
          fehler={bildFehler.avatar}
          onDatei={(datei) => pruefeDatei("avatar", "Profilbild", datei)}
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="block w-32">
          <span className="mb-1 block text-xs font-medium text-muted">Reihenfolge</span>
          <input
            name="sortOrder"
            type="number"
            defaultValue={partner?.sortOrder ?? 0}
            className={feldClass}
          />
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={partner?.active ?? true}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Auf der Startseite zeigen
        </label>

        <button
          type="submit"
          disabled={pending || fehlerListe.length > 0}
          className="ml-auto rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Wird gespeichert..." : bearbeiten ? "Änderungen speichern" : "Kooperation anlegen"}
        </button>
      </div>

      {fehlerListe.map((meldung) => (
        <p key={meldung} className="text-xs text-danger">
          ❌ {meldung}
        </p>
      ))}
      {state?.error && <p className="text-xs text-danger">❌ {state.error}</p>}
      {state?.ok && <p className="text-xs text-accent-2">✅ Gespeichert.</p>}
    </form>
  );
}

function BildFeld({
  label,
  name,
  entfernenName,
  vorhanden,
  fehler,
  onDatei,
  breit,
}: {
  label: string;
  name: string;
  entfernenName: string;
  vorhanden: string | null;
  fehler?: string;
  onDatei: (datei: File | null) => void;
  breit?: boolean;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {vorhanden && (
        <div className="mb-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={vorhanden}
            alt=""
            className={
              breit
                ? "h-16 w-32 rounded-lg border border-border object-cover"
                : "h-16 w-16 rounded-full border border-border object-cover"
            }
          />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name={entfernenName} className="h-3.5 w-3.5 accent-[var(--danger)]" />
            Entfernen
          </label>
        </div>
      )}
      <input
        type="file"
        name={name}
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => onDatei(e.target.files?.[0] ?? null)}
        className={`w-full text-xs text-muted file:mr-3 file:rounded-lg file:border file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-surface ${
          fehler ? "file:border-danger" : "file:border-border"
        }`}
      />
      <p className={`mt-1 text-[11px] ${fehler ? "text-danger" : "text-muted"}`}>
        {fehler ?? "PNG, JPG, WEBP oder GIF, höchstens 5 MB."}
      </p>
    </div>
  );
}

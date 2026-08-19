"use client";

import { useState } from "react";

/**
 * Aufklappbarer Gespraechsverlauf eines geschlossenen Tickets. Standardmaessig
 * eingeklappt, damit die Archiv-Liste kompakt bleibt.
 */
export default function TicketTranscript({ transcript }: { transcript: string }) {
  const [open, setOpen] = useState(false);
  const lineCount = transcript.split("\n").length;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-accent transition hover:underline"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
          ▶
        </span>
        Verlauf {open ? "ausblenden" : "anzeigen"} ({lineCount} Nachrichten)
      </button>
      {open && (
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2/50 p-3 text-[11px] leading-relaxed text-muted">
          {transcript}
        </pre>
      )}
    </div>
  );
}

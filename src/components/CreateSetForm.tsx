"use client";

import { useActionState, useEffect, useRef } from "react";
import { createSet, type SetState } from "@/app/actions/itemSets";

const initialState: SetState = null;

/** Legt ein neues, leeres Set an - Items kommen danach dazu. */
export default function CreateSetForm() {
  const [state, formAction, pending] = useActionState(createSet, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        name="name"
        required
        maxLength={40}
        placeholder="Name des Sets, z.B. Mining oder PvP"
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Wird angelegt..." : "Set anlegen"}
      </button>
      {state?.error && <p className="w-full text-xs text-danger">❌ {state.error}</p>}
    </form>
  );
}

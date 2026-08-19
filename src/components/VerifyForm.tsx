"use client";

import { useActionState } from "react";
import { verifySelf, verifyMemberAsStaff, type VerifyState } from "@/app/actions/verification";

const initialState: VerifyState = null;

export default function VerifyForm({
  memberId,
  defaultName,
  asStaff = false,
}: {
  memberId: string;
  defaultName?: string;
  asStaff?: boolean;
}) {
  const action = asStaff ? verifyMemberAsStaff.bind(null, memberId) : verifySelf;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="space-y-1.5">
      <form action={formAction} className="flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          name="minecraftName"
          defaultValue={defaultName}
          placeholder="Dein Minecraft-Name"
          required
          className="w-52 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Wird geprüft..." : "Jetzt verifizieren"}
        </button>
      </form>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.message && <p className="text-xs text-accent-2">{state.message}</p>}
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { sendDiscordDirectMessage } from "@/lib/discord";
import { postOverdueNotice } from "@/lib/overdueChannel";
import {
  formatDuration,
  suspensionForOverdue,
  LOAN_REMINDER_STAGE,
  LOAN_STATUS,
  OVERDUE_SUSPENSION_GRACE_MS,
  SITE_NAME,
  type LoanReminderStageValue,
} from "@/lib/constants";

const STAGE_ORDER: LoanReminderStageValue[] = [
  LOAN_REMINDER_STAGE.NONE,
  LOAN_REMINDER_STAGE.THIRTY,
  LOAN_REMINDER_STAGE.FIVE,
  LOAN_REMINDER_STAGE.OVERDUE,
  LOAN_REMINDER_STAGE.SUSPENDED,
];

function stageIndex(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage as LoanReminderStageValue);
  return i === -1 ? 0 : i;
}

/** Welche Erinnerungsstufe eine Ausleihe JETZT haben sollte, anhand der verbleibenden Zeit bis dueAt. */
function targetStage(msRemaining: number): LoanReminderStageValue {
  if (msRemaining <= -OVERDUE_SUSPENSION_GRACE_MS) return LOAN_REMINDER_STAGE.SUSPENDED;
  if (msRemaining <= 0) return LOAN_REMINDER_STAGE.OVERDUE;
  if (msRemaining <= 5 * 60_000) return LOAN_REMINDER_STAGE.FIVE;
  if (msRemaining <= 30 * 60_000) return LOAN_REMINDER_STAGE.THIRTY;
  return LOAN_REMINDER_STAGE.NONE;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Prueft alle aktiven Ausleihen gegen ihre 2h-Frist und schickt bei Bedarf
 * genau EINE Discord-DM fuer die aktuell faellige Stufe (30 Min. vorher,
 * 5 Min. vorher, Frist abgelaufen, oder - bei mehr als 15 Min. Ueberziehung -
 * eine Ausleih-Sperre samt Warnung). Wird per Cron (VPS-Crontab, jede
 * Minute) ueber /api/cron/loan-reminders aufgerufen. Rein additiv: eine
 * einmal erreichte Stufe wird nie zurueckgesetzt, ausser durch eine neue
 * Ausleihe (frisches reminderStage "NONE").
 */
export async function processLoanReminders(): Promise<{ remindersSent: number; suspensionsApplied: number }> {
  const now = new Date();
  const activeLoans = await prisma.loan.findMany({
    where: { status: LOAN_STATUS.ACTIVE, dueAt: { not: null } },
    include: { item: true, member: true },
  });

  let remindersSent = 0;
  let suspensionsApplied = 0;

  for (const loan of activeLoans) {
    if (!loan.dueAt) continue;
    const msRemaining = loan.dueAt.getTime() - now.getTime();
    const target = targetStage(msRemaining);

    if (stageIndex(target) <= stageIndex(loan.reminderStage)) continue;

    await prisma.loan.update({ where: { id: loan.id }, data: { reminderStage: target } });

    if (target === LOAN_REMINDER_STAGE.SUSPENDED) {
      // Vorlaeufig - beim Zurueckgeben wird anhand der tatsaechlich
      // ueberzogenen Zeit neu gerechnet (siehe returnLoanCore).
      const dauer = suspensionForOverdue(-msRemaining);
      const suspendedUntil = new Date(now.getTime() + dauer);
      const reason = `"${loan.item.name}" um mehr als 15 Min. überzogen (Ausleihe vom ${formatDateTime(loan.borrowedAt)}).`;

      await prisma.member.update({
        where: { id: loan.memberId },
        data: { borrowSuspendedUntil: suspendedUntil, borrowSuspendedReason: reason },
      });
      await logAction({
        actorId: loan.memberId,
        targetId: loan.memberId,
        action: "BORROW_SUSPENDED",
        details: `${reason} Ausleih-Sperre bis ${formatDateTime(suspendedUntil)}.`,
      });
      await sendDiscordDirectMessage(loan.member.discordId, {
        embeds: [
          {
            title: "🚫 Ausleih-Sperre verhängt",
            description:
              `Du hast **"${loan.item.name}"** um mehr als 15 Minuten überzogen und bist deshalb bis **${formatDateTime(suspendedUntil)}** ` +
              `für neue Ausleihen im ${SITE_NAME} gesperrt.\n\n` +
              `**Gib das Item sofort zurück.** Solltest du es im Spiel trotzdem weiter behalten, gilt das als Diebstahl — ` +
              `dein Verleih-Zugang wird dann ohne Rückerstattung des Geldes sofort beendet.`,
            color: 0xf2545b,
          },
        ],
      });
      // Bestehende Ueberzieh-Meldung im Kanal auf "gesperrt" hochstufen.
      await postOverdueNotice(loan.id, "suspended").catch((err) =>
        console.error("[ueberzogen] Meldung fehlgeschlagen:", err)
      );

      suspensionsApplied++;
      continue;
    }

    const embed = (() => {
      if (target === LOAN_REMINDER_STAGE.THIRTY) {
        return {
          title: "⏳ Noch 30 Minuten",
          description: `Du hast **"${loan.item.name}"** noch **30 Minuten**, dann läuft die 2h-Ausleihfrist ab. Bitte plane die Rückgabe ein.`,
          color: 0xf2b544,
        };
      }
      if (target === LOAN_REMINDER_STAGE.FIVE) {
        return {
          title: "⚠️ Noch 5 Minuten",
          description: `Deine Ausleihfrist für **"${loan.item.name}"** läuft in **5 Minuten** ab. Bitte gib das Item rechtzeitig zurück.`,
          color: 0xf28b44,
        };
      }
      // OVERDUE
      return {
        title: "⏰ Ausleihfrist abgelaufen",
        description:
          `Deine Ausleihfrist für **"${loan.item.name}"** ist **gerade abgelaufen**. Bitte gib das Item sofort zurück — ` +
          `nach 15 weiteren Minuten wird automatisch eine 2h-Ausleih-Sperre verhängt.`,
        color: 0xf2545b,
      };
    })();

    await sendDiscordDirectMessage(loan.member.discordId, { embeds: [embed] });

    // Sobald eine Frist reisst, sieht das auch die Aufsicht im Kanal.
    if (target === LOAN_REMINDER_STAGE.OVERDUE) {
      await postOverdueNotice(loan.id, "overdue").catch((err) =>
        console.error("[ueberzogen] Meldung fehlgeschlagen:", err)
      );
    }

    remindersSent++;
  }

  return { remindersSent, suspensionsApplied };
}

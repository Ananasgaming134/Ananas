import { prisma } from "@/lib/prisma";

/**
 * Erzeugt eine neue, eindeutige 6-stellige Kundennummer. Wird als
 * Verwendungszweck bei Business-Card-Ueberweisungen genutzt ("Verleih
 * <Kundennummer>"), um Zahlungen zuverlaessig einem Mitglied zuzuordnen -
 * unabhaengig davon, von welchem Discord-Account tatsaechlich ueberwiesen
 * wird (siehe src/lib/payments.ts).
 */
export async function generateCustomerNumber(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await prisma.member.findUnique({ where: { customerNumber: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Konnte keine eindeutige Kundennummer erzeugen.");
}

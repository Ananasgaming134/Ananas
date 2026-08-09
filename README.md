# OP-LeihCenter

Item-Verleih-Plattform für den Minecraft-Server **OPSucht** ([opsucht.net](https://opsucht.net)).
Verwaltet den Verleih von Server-Items, Kunden-Akten und das Mitglieder-Archiv –
Login ausschließlich per Discord-Account mit passender Server-Rolle.

Tech-Stack: **Next.js 16 (App Router) · TypeScript · Tailwind CSS · Prisma (SQLite) · Auth.js/NextAuth v5 (Discord OAuth) · discord-interactions**.

## Schnellstart

```bash
npm install
npm run db:push     # legt die SQLite-Datenbank gemäß prisma/schema.prisma an
npm run db:seed     # optional: Beispiel-Items und Beispiel-Mitglieder
npm run dev
```

Danach [http://localhost:3000](http://localhost:3000) öffnen.

## Aktueller Stand

Fertig umgesetzt:

- Landingpage mit animiertem Hintergrund, Live-Statistiken und Team-Bereich
  (Owner/Aufsicht live von Discord bzw. aus der eigenen Mitglieder-Akte)
- Discord-Login mit Rollenprüfung (Kunde LeihCenter / Aufsichtsperson / Owner),
  vollständig scharf geschaltet und getestet
- Item-Katalog mit Bild, Kategorie, Durchschnittspreis (Preis-Datenbank-Anbindung,
  Quelle bewusst nicht sichtbar), Ausleihen/Zurückgeben, Suche nach Name +
  Filter nach Kategorie. Der Item-Wert selbst wird beim Ausleihen/im
  Discord-Panel bewusst NICHT angezeigt (nur Owner sieht ihn unter „Items
  verwalten“) – auf der Startseite ist nur die Summe aller Item-Werte im
  Verleih sichtbar
- Owner-Bereich zum Anlegen/Bearbeiten/Löschen von Items sowie eigene
  Kategorien-Verwaltung (`/dashboard/verwaltung/items/kategorien` – anlegen/
  umbenennen/löschen, Items werden per Dropdown einsortiert)
- **Kundenbereich und Verwaltung sind jetzt getrennte Bereiche**: Alles unter
  `/dashboard/verwaltung/*` (Kunden, Mitglieder-Archiv, Logs, Items, Bot) ist
  ein eigener, nur für Aufsicht/Owner sichtbarer Bereich mit eigener
  Navigation und eigener Übersichtsseite, erreichbar über einen deutlich
  abgesetzten „Verwaltung“-Button im normalen Kundenbereich-Menü
  (`src/components/DashboardNav.tsx`). Der Kundenbereich (`/dashboard`,
  `/dashboard/items`, `/dashboard/akte`) bleibt für alle Rollen schlank und
  zeigt nur die eigenen Daten
- Kunden-Akten (jetzt „Profil“ genannt) mit vollständiger Ausleihhistorie,
  Statistik-Kacheln (Ausleihen insgesamt, aktuell ausgeliehen, Lieblings-Item),
  Abo-Status mit farblicher Kennzeichnung und Laufzeit-Fortschrittsbalken;
  Minecraft-Name ist für Aufsicht/Owner direkt in der Akte änderbar (wird
  geloggt). In der eigenen Ansicht (isSelf) zeigt die Abo-Karte statt des
  Admin-Zuweisungsformulars eine Zahlungsanleitung (Business-Card BC-584289 +
  Preise je Laufzeit) – kein Self-Service-Self-Grant, die Verlängerung
  passiert erst nach echtem Zahlungseingang (siehe „Noch offen“ unten)
- Kunden-Übersicht als Karten-Grid (Avatar, Status/Abo-Badges, Kennzahlen),
  zeigt alle Discord-Mitglieder mit der Kunde-Rolle als aktiv, auch wenn sie
  sich noch nie eingeloggt haben (braucht "Server Members Intent", siehe
  unten), mit Suche (Name/Discord-/Minecraft-Name) und Übersichts-Kacheln
  für aktive/abgelaufene Abos
- Dauerhaftes Mitglieder-Archiv mit Suche, Notizen, Freigabe entziehen/
  wiederherstellen, dauerhafter Ausschluss
- Lückenloses Audit-Log aller Aktionen – wird zusätzlich live in einen
  Discord-Kanal gespiegelt (`src/lib/audit.ts`, `DISCORD_LOG_CHANNEL_ID`)
- Abo-Ablauf-Erinnerungen mit Verlängern-Buttons (1/3/6 Monate) im
  Discord-Abo-Kanal (`src/lib/subscriptions.ts`, manuell auslösbar über
  „Abo-Ablauf jetzt prüfen“ auf `/dashboard/verwaltung/bot` – kein automatischer
  Scheduler vorhanden)
- Beträge werden in Dollar angezeigt (`formatCoins` in `src/lib/constants.ts`)
- **Discord-Bot-System (Multi-Server-fähig)**, siehe eigener Abschnitt unten

## Discord-Bot-System

Kein Dauerprozess/Gateway nötig – alles läuft über normale HTTPS-Aufrufe:

- **Owner-Bereich `/dashboard/verwaltung/bot`**: beliebig viele Discord-Server mit
  Kanal-ID (fürs Panel) und Rollen-ID (wer dort ausleihen darf) hinterlegen.
  Der Bot muss vorher manuell auf den jeweiligen Server eingeladen werden
  (Link wird auf der Seite angezeigt) – das kann nicht automatisch passieren.
- **Selbst aktualisierendes Panel** (`src/lib/discordPanel.ts`): postet eine
  Embed-Nachricht mit Auswahlmenü aller Items in den konfigurierten Kanal
  und **editiert dieselbe Nachricht** bei jeder Änderung (Ausleihen,
  Zurückgeben, Item angelegt/bearbeitet/gelöscht, Preis aktualisiert) –
  keine neue Nachricht pro Update.
- **Slash-Befehl `/akte <user>`**: für Aufsichtspersonen/Owner, zeigt die
  vollständige Akte einer Person – nur für die aufrufende Person sichtbar
  (ephemeral).
- **Slash-Befehl `/setup item-panel` / `/setup status-panel`**: nur für
  Owner, richtet das Ausleih- bzw. Status-Panel direkt im Kanal ein, in dem
  der Befehl ausgeführt wird – ohne Umweg über `/dashboard/verwaltung/bot`. Bei der
  Ersteinrichtung eines Servers muss bei `item-panel` die Option „rolle“
  mitgegeben werden (wer dort ausleihen darf).
- Beide Befehle werden pro Server gemeinsam über den
  "Slash-Befehle registrieren"-Button auf `/dashboard/verwaltung/bot` registriert
  (ein einzelner PUT-Aufruf an Discord, der ersetzt sonst die komplette
  Befehlsliste der Guild).
- **Gemeinsame Kernlogik** (`src/lib/loans.ts`): Web-Formular und
  Discord-Interaktionen nutzen dieselben `borrowItemCore`/`returnLoanCore`-
  Funktionen, keine doppelte Logik.
- Interaktions-Endpunkt: `src/app/api/discord/interactions/route.ts`
  (Signaturprüfung über `discord-interactions`, `DISCORD_PUBLIC_KEY` wurde
  automatisch per API geholt, siehe `.env`).

**Wichtige Einschränkung (keine Fehlerquelle im Code, sondern eine
Discord-Vorgabe):** Buttons und Slash-Befehle reagieren erst, sobald diese
Seite öffentlich per HTTPS erreichbar ist und diese URL im Discord Developer
Portal als "Interactions Endpoint URL" hinterlegt wurde
(`https://DEINE-DOMAIN/api/discord/interactions`) – Discord kann `localhost`
nicht erreichen. Das reine Posten/Aktualisieren des Panels funktioniert
bereits jetzt lokal (ausgehende Aufrufe).

Noch offen, bevor der Bot komplett nutzbar ist:

- Rollen-IDs für die Team-Anzeige "Developer" / "Developer-Leitung"
  (`DISCORD_ROLE_DEVELOPER`, `DISCORD_ROLE_DEVELOPER_LEITUNG` in `.env`,
  aktuell leer – Gruppen werden einfach ausgeblendet bis sie gesetzt sind)
- Channel-ID für das erste Panel (wurde vom Nutzer angekündigt)
- Öffentliches Deployment, damit Discord die Interactions-URL erreichen kann

### Zahlungserkennung (Business-Card-Überweisungen)

`src/lib/payments.ts` liest den Zahlungskanal (`DISCORD_PAYMENTS_CHANNEL_ID`,
Business-Card BC-584289) aus und erkennt eingehende Überweisungen (Embed-Titel
"Überweisung erhalten" / "Von Business Card erhalten"). Jedes Mitglied hat
eine zufällig vergebene, eindeutige **Kundennummer** (`Member.customerNumber`,
6-stellig, vergeben in `src/lib/customerNumber.ts` bei jeder Neuanlage).
Zahlungen werden primär über den Verwendungszweck `"Verleih <Kundennummer>"`
zugeordnet (funktioniert auch, wenn jemand für eine andere Person überweist),
mit Discord-Username als Fallback. Dedupliziert per Discord-Nachrichten-ID
(`Payment.discordMessageId`, unique). Weist absichtlich NIE automatisch einen
Abo-Plan zu – die Business-Card-Währung (₵) hat eine andere Skala als unsere
$-Abo-Preise. Aufsicht/Owner bestätigen die Zuordnung manuell unter
`/dashboard/verwaltung/zahlungen` (Button "Zahlungen jetzt prüfen", kein
automatischer Scheduler – gleiche Einschränkung wie bei den Abo-Erinnerungen).
Die eigene Kundennummer + genaue Zahlungsanleitung sieht jeder in seinem Profil.

## Nächste Schritte, die noch von dir kommen

### 1. Discord OAuth App (für den Login) — ERLEDIGT

Rollen-IDs, Bot-Token, die Guild-ID des "OP - LeihCenter"-Servers
(`1469711700554027130`) sowie Client-ID und Client-Secret der OAuth-App
(dieselbe App wie der Bot, "Systemsteuerung") sind in `.env` hinterlegt.
`DEV_BYPASS_ROLE_CHECK` steht auf `false`.

Für Produktivbetrieb auf einer echten Domain zusätzlich die dortige
Callback-URL (`https://DEINE-DOMAIN/api/auth/callback/discord`) unter
**OAuth2 → Redirects** in der Discord-App ergänzen und `NEXTAUTH_URL` in
`.env` entsprechend anpassen – und wie oben beschrieben die Interactions-URL
setzen, sobald die Seite öffentlich ist.

### 2. Item-Preisquelle – Hinweis zur Robustheit

`src/lib/priceSource.ts` liest die Item-Datenbank direkt aus dem
serverseitig gerenderten HTML einer externen Seite (kein offizielles/
dokumentiertes API, die Daten stecken im eingebetteten Next.js-Flight-
Payload). Das ist bewusst defensiv geschrieben: ändert sich das
Seitenformat grundlegend, liefert die Suche/Preis-Aktualisierung einen
Fehler statt falscher Daten, und betroffene Items werden auf
`priceStatus: "UNAVAILABLE"` gesetzt statt veraltete Preise stehen zu
lassen.

## Projektstruktur

```
prisma/schema.prisma       Datenmodell (Member, Item, Loan, MemberNote, AuditLog, BotDeployment)
prisma/seed.ts             Beispieldaten für die lokale Entwicklung
src/auth.ts                NextAuth-Konfiguration inkl. Discord-Rollenprüfung
src/proxy.ts               Route-Schutz für /dashboard (Next.js "proxy"-Konvention)
src/lib/                   Prisma-Client, Konstanten, Session, Statistiken, Team, Discord-Helper
src/lib/loans.ts           Gemeinsame Ausleih-Kernlogik (Web + Discord-Bot)
src/lib/discordPanel.ts    Baut/postet/aktualisiert das Discord-Item-Panel
src/lib/discordInteractions.ts  Hilfsfunktionen für den Interactions-Endpunkt
src/app/dashboard/(main)/  Geschützter Bereich mit Sidebar (Übersicht, Items, Akten, Archiv, Logs, Bot)
src/app/dashboard/onboarding/  Eigenständiges schlankes Layout (Minecraft-Name-Abfrage)
src/app/actions/           Server Actions (Ausleihen, Item-, Mitglieder-, Bot-Verwaltung)
src/app/api/discord/interactions/  Endpunkt für Discord-Slash-Befehle/Buttons
```

## Monatliche Gebühr

Der Standardwert (5.000.000) ist in `MONTHLY_FEE_DEFAULT`
(`src/lib/constants.ts`) hinterlegt und wird pro Mitglied in
`Member.monthlyFee` gespeichert (individuell anpassbar, angezeigt in
Dollar). Eine automatische Fälligkeits-/Zahlungsprüfung ist noch nicht
umgesetzt (`feePaidUntil`-Feld ist im Schema bereits vorbereitet).

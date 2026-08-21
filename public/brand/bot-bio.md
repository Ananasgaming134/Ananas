# Bot-Branding — OP-LeihCenter

Alle Texte und Bilder für das Discord-Profil des Bots. Bilder liegen daneben
(`bot-avatar.png`, `bot-banner.png`), die SVG-Quellen ebenfalls — neu erzeugen
mit `node scripts/generate-bot-branding.mjs`.

---

## Profilbild

`bot-avatar.png` — 1024×1024, quadratisch. Discord schneidet automatisch rund
zu; der Akzentring ist genau darauf abgestimmt.

## Banner

`bot-banner.png` — 960×540 (16:9). Passt für das Bot-Profilbanner und
gleichzeitig als Header-Bild im Server.

---

## Beschreibung (Bot-Profil)

Discord erlaubt in der "App-Beschreibung" bis zu 400 Zeichen. Kurzfassung:

> Der offizielle Verleih-Bot des OP-LeihCenters auf OPSucht. Leih dir die
> stärksten Items direkt hier im Discord — Bestand und Verfügbarkeit siehst du
> live, Ausleihen dauert zwei Klicks. Abo per Business-Card, Rückgabe nach
> 2 Stunden. Support und Bewerbung ebenfalls direkt über den Bot.

*(377 Zeichen)*

### Noch kürzer (falls das Feld enger ist)

> Verleih-Bot des OP-LeihCenters. Items live durchstöbern, in zwei Klicks
> ausleihen, nach 2 Stunden zurückgeben. Abo, Support und Bewerbung direkt
> im Discord.

*(168 Zeichen)*

---

## Ausführliche Beschreibung (für einen Info-Kanal oder die App-Detailseite)

> ### 📦 OP-LeihCenter
>
> Das LeihCenter ist der Item-Verleih für OPSucht — und dieser Bot ist der
> schnellste Weg dorthin.
>
> **Was er kann**
> - **Kompletter Bestand im Discord**: nach Kategorien sortiert, mit
>   Live-Verfügbarkeit pro Item (🟢 frei · 🟡 fast vergriffen · 🔴 verliehen)
> - **Ausleihen in zwei Klicks**: Item im Menü wählen, auf *Ausleihen* klicken
> - **Gezielte Suche**: Namen eintippen statt scrollen
> - **Immer sichtbar, was gerade draußen ist** — samt Rückgabefrist
> - **Erinnerungen per DM**, bevor die 2 Stunden ablaufen
> - **Tickets & Bewerbungen** direkt über den Bot
>
> **Spielregeln**
> - Ausleihen geht mit **Kundenrolle und aktivem Abo**
> - **2 Stunden** pro Ausleihe, danach 30 Minuten Pause für dasselbe Item
> - Guthaben lädst du per Business-Card auf, davon wird dein Paket gebucht
>
> Fragen? Mach einfach ein Support-Ticket auf.

---

## Kurze Statuszeile ("Spielt gerade …")

Falls du dem Bot eine Aktivität geben willst:

- `beobachtet` → `den Item-Bestand`
- `spielt` → `Verleih | /ausleihen`
- `hört` → `eure Rückgabe-Ausreden`

---

## Farben

| Zweck            | Hex       |
| ---------------- | --------- |
| Akzent (Gold)    | `#f2b544` |
| Akzent dunkel    | `#c98d1f` |
| Zweitakzent      | `#3ddc97` |
| Hintergrund      | `#0d0f14` |
| Hintergrund hell | `#161a23` |

Dieselben Werte wie auf der Website (`src/app/globals.css`) — damit Discord und
Seite zusammen wirken.

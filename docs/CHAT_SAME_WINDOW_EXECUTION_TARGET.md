# Sama chati aken → Jarvis → kalender (sihtmärk)

## 1. LÕPPEESMÄRK

Omanik kirjutab **samas vestlusaknas** lause kujul (nt „lisa kalendrisse täna kell 19 vaata pesumasinat“); see peab **jõudma Jarvis serverisse** ja **muutma Google kalendrit** — **sõltumata** seadmest (telefon / arvuti / tahvel) ja **sõltumata** võrgust (WiFi, mobiilid, väljaspool kodu-LAN-i).

## 2. MIS PRAEGU TÖÖTAB

- Jarvis **lokaalselt**: kalendri API ja teenus (nt loomine), **voice/text** teed (`/api/voice/turns` jms) kui klient **jõuab** Jarvisini.
- **Bridge** mustand: `spec/openapi.yaml`, token-põhine `GET/POST` bridge marsruudid (sh kalendri lugemine / loomine osaliselt).
- **Dokumentatsioon**: remote bridge, käskude leping, OpenAPI plaan.

## 3. MIS PRAEGU PUUDUB

- **Avalik, turvaline otspunkt** (HTTPS + auth), kuhu **ChatGPT (või sama chati kiht)** saaks päringu saata **igal ajast ja võrgust**.
- **Ühtne voog**: kasutaja lause chatis → **normaliseeritud käsk** → Jarvis → kalender (ilma „pead olema samas masinas / localhost“ eelduseta).
- **Täna kell 19** jms **loomise** tee läbi bridge’i **lõpuni seotud** sama kasutajakogemusega (kui see pole veel prod-is lubatud).

## 4. MIKS SEE CHAT VEEL KALENDRIT OTSE EI MUUDA

Chat (nt ChatGPT) **ei tea** Jarvisi **internetis** aadressi ega **hoia** `JARVIS_BRIDGE_TOKEN`-it; **CORS / võrk** ei suuna sõnumeid iseenesest Jarvis API-sse. Ilma **konfigureeritud integratsioonita** (Action, plugin, brauseri agent vms) jääb tekst **ainult** chatisse.

## 5. MINIMAALNE PUUDUV LÜLI

**Üks** kontrollitud tee: **HTTPS bridge** (prod host) + **server-server auth** + **ChatGPT Action** (või ekvivalent), mis kutsub **POST** (või voice-kontrakti) **fikseeritud** skeemiga — kas otse „lisa sündmus“ väljadega või **lühike parser** Jarvisi poolel (järgmine ehitussamm otsustab, kust parser elab).

## 6. MILLINE PEAB OLEMA LÕPLIK VOOG

Omanik → **sama chat** → **tuvastatud intent** → **autenditud päring** Jarvis bridge’ile → **CalendarService** (või voice sarnane tee) → **Google Calendar** → kinnitus chatis (õnnestus / viga / auth vajalik).

## 7. MIS ON JÄRGMINE REAALNE EHITUSSAMM

**Paigalda** (või tunnel + TLS) **üks** avalik bridge baas-URL, sea **`JARVIS_BRIDGE_TOKEN`**, kontrolli **`POST /bridge/v1/calendar/events`** prod-is; seejärel **loo ChatGPT Action** (või GPT), mis selle endpointi **kirjelduse järgi** kutsub — **minimaalne** lõpptest: üks lause → üks kalendrikirje tekkimine.

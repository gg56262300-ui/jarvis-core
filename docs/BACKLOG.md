# Jarvis Backlog

## Omaniku kinnitatud tööjärjekord (2026-04-19)

**KINNITAN järjekord** — järjekord: (1) kalender + Robert / PWA testimine ja stabiliseerimine → (2) Make (webhook stsenaarium kuulamas) → (3) CRM testimine → (4) e-post testimine → (5) kontaktid → (6) WhatsApp. Gmail/Contacts/WhatsApp **kood** ainult eraldi `KINNITAN: …` vastavalt `AGENTS.md`.

## NOW

- **(1) Robert / kalender + PWA:** omaniku testimine; `clientTimeZone` + `clientLocalCalendarDate`; masskustutus / tööriista väljundid; Jah/Ei riba ainult ohtliku tegevuse korral (`public/chat.html`). **PWA:** `footer-v19+` + `sw.js`.
- **(2) Make:** `.env` `MAKE_WEBHOOK_URL` olemas → Make’is sama webhookiga stsenaarium **ON** + Router `source`/`event` (`docs/MAKE_CONTRACT.md`).

## NEXT

- **(3) CRM:** `/api/crm` — testimine, vead tagasi arendusse.
- **(4) E-post:** testimine paralleelselt; **Gmail koodimuudatused** ainult `KINNITAN: Gmail`.
- **Chat + Google Calendar (regressioon):** tööriista väljundi kuvamine, `listUpcomingEventsWithinDays` + `clientLocalCalendarDate`.
- **WhatsApp Cloud API:** ainult pärast `KINNITAN` / Meta UI valmidust.
- **Kontaktid (kood):** ainult `KINNITAN: Contacts`.
- **Logid (valikuline):** kalendri tööriista lühilogi (ilma saladusteta).

## LATER

- **PWA:** vahemälu / uue `chat.html` jõudmine mobiilile, peened täiendused (manifest + PNG ikoonid juba repos).
- **`public/chat.html`:** üksikute nuppude / keelelüliti peened täiendused pärast kasutajapoolset testimist.
- **Lennud / mitu ajavööndit:** Roberti prompt juba mainib — vajadusel eraldi kasutuslood + täpsustused.

## DONE

- **PWA (Android installitavus):** `public/icons/icon-192.png`, `icon-512.png` + `manifest.webmanifest` PNG kirjed (vt LATER real „manifest/ikoonid” osaliselt kaetud).
- **Make kiht:** `classifyMakeFailure` + `JARVIS_MAKE_EVENTS` unit testid (`npm run test:make-webhook`, osa `gate:fast`); masinloetav skeem `spec/make-jarvis-webhook.payload.schema.json`.
- Omaniku kinnitatud **tööjärjekorra** kirjetus (KINNITAN järjekord, 2026-04-19)
- `npm run smoke` chat päring sisaldab `clientTimeZone` + `clientLocalCalendarDate` (regressioonitest)
- Google OAuth: Gmail + Calendar + Contacts (`/oauth2/google`, `npm run google:oauth:*`)
- Agent control layer
- Calendar voice output pehmendamine
- Gmail voice action flow
- Sentry basic
- `docs/BACKLOG.md` struktureeritud nimekiri (omaniku kinnitus **KINNITAN: BACKLOG fail**, 2026-04-18)

# Reaalne süsteemi staatus (fikseeritud fakt)

## 1. MIS TÖÖTAB PÄRISELT

- Jarvis **backend** kohalikult / PM2 all (kui nii seatud): **health**, moodulid (sh **kalender**, Gmail, voice API jne), kui klient **jõuab** selle serverini.
- **Bridge** marsruudid (tokeniga): `GET /bridge/v1/health`, kalendri **read** teed, `POST /bridge/v1/calendar/events` (loomine läbi `CalendarService`); **PATCH** update-by-id on **501 NOT_IMPLEMENTED_YET**.
- **API kalender** teed `/api/calendar/*` (sh `today` / `next` alias’ed), kui Google OAuth on korras.
- **Dokumentatsioon** ja **OpenAPI mustand** (`spec/openapi.yaml`) bridge jaoks on olemas.

## 2. MIS EI TÖÖTA VEEL

- **ChatGPT vestlus ise** ei saada päringuid Jarvisisse — **kuni** pole seadistatud **Actions / Custom GPT** + **avalik HTTPS** otspunkti + **token** konfiguratsioonis.
- **Loomulik lause** („täna kell 19 …“) **ChatGPT aknast** ei teisendu **automaatselt** kalendrisündmuseks **ilma** integratsiooni ja/või struktureeritud keha / parserita.
- **Täielik idempotency** salvestus bridge POST jaoks **pole** — ainult päise kohustuslikkus.

## 3. MIKS OMANIK NÄEB SAMA CHATTI, AGA KÄSK EI TÄITU

ChatGPT on **eraldiseisev** teenus; see **ei tea** Jarvisi **URL-i** ega **hoia** bridge tokenit. Tekst jääb **mudeli vastusesse**, mitte **HTTP päringuks** Jarvis API-sse, kuni integratsioon on **eksplitsiitselt** üles seatud.

## 4. MIS OLI VALE SÕNASTUS VAREM

Et **„sama chat“** tähendaks **iseenesest** Jarvisi ja kalendri muutust — **ilma** avaliku sillata, **ilma** Actionita ja **ilma** selge võrguteeta. Tegelikult on vaja **viimast lüli** (host + auth + Action + test).

## 5. ÕIGE PRAEGUNE STAATUS

**Jarvis + bridge kooditee** on **suures osas olemas** lokaalselt / repost; **tootmise lõppkasutaja kogemus** „ChatGPT → kalender“ on **pooleli** — ootab **hostimist / TLS-i**, **tokeni** haldust ja **ChatGPT Actions** (või samaväärse) **seadistust**.

## 6. MIS ON VIIMANE PUUDUV LÜLI

**Üks töötav ahel:** `HTTPS` Jarvis → `JARVIS_BRIDGE_TOKEN` päises → **Custom GPT Action** kutsub **health** + **calendar** endpoint’e → omanik testib **ühe** reaalse loomise.

## 7. JÄRGMINE EHITUSSAMM

**Paigalda** (või turvaline tunnel + sert) **üks** avalik baas-URL, kontrolli bridge **curl**-iga väljastpoolt, **loo** ChatGPT Action OpenAPI põhjal, **tee üks** lõpust-lõpuni test (health → create); dokumenteeri URL ja **mitte** commiti tokenit.

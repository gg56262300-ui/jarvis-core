# ChatGPT Actions ↔ Jarvis bridge — integratsiooni plaan

## 1. Eesmärk

Võimaldada **samas ChatGPT vestluses** (Actions / Custom GPT), et mudel kutsub **turvaliselt** Jarvis **bridge** endpoint’e — esmalt **lugemine + tervis**, seejärel **kalendri loomine**, vastavalt `CHAT_SAME_WINDOW_EXECUTION_TARGET.md` ja bridge dokumentatsioonile.

## 2. Mis peab enne olemas olema

- **HTTPS** baas-URL Jarvisile (mitte localhost väliskasutajale).
- Keskkonnas seatud **`JARVIS_BRIDGE_TOKEN`** ja serveris sama väärtuse kontroll.
- **OpenAPI kirjeldus** (nt `spec/openapi.yaml` või eksporditud koopia), mida ChatGPT Actions saab importida / kleepida.
- Omaniku otsus: **üks** GPT / Action, **üks** baas-URL (staging vs prod).

## 3. Milliseid bridge endpoint’e kasutame esimesena

1. `GET /bridge/v1/health` — ühenduse ja tokeni kontroll.  
2. `GET /bridge/v1/calendar/today` — loetav tagasiside ilma kirjutuseta.  
3. `GET /bridge/v1/calendar/next` / `GET /bridge/v1/calendar/upcoming` — vajadusel kontekst.  
4. `POST /bridge/v1/calendar/events` — **alles pärast** punktide 1–3 edukat testi; keha `title`, `start`, `end` + **`Idempotency-Key`** (vt `CHATGPT_JARVIS_BRIDGE_COMMANDS.md`).

## 4. Auth mudel

- **Server–server:** päis `x-jarvis-bridge-token: <JARVIS_BRIDGE_TOKEN>`.  
- ChatGPT Action konfiguratsioonis **API key** või **Custom header** (platvormi võimaluste piires); **ei** jäta tokenit süsteemi sõnumitesse kasutajale nähtavalt.  
- Token **rotate** võimalus pärast kompromiteerimise riski.

## 5. Minimaalne ChatGPT Actions voog

1. Loo **Custom GPT** (või Action) → **Actions** → **Import from OpenAPI** (või käsitsi skeem).  
2. Määra **Server URL** = bridge baas (ilma teedeta, kui platvorm nõuab ainult hosti — järgi OpenAPI `servers`).  
3. Lisa **authentication**: custom header = `x-jarvis-bridge-token`.  
4. Juhendi (Instructions): „Kui kasutaja soovib kalendrisse lisada, kogu **title**, **start**, **end** (ISO või fikseeritud formaat) ja kasuta **POST** … koos **unikaalse** Idempotency-Key-ga.“  
5. Test: vestluses „kontrolli Jarvisi ühendust“ → `health`; seejärel piiratud **create** test.

## 6. Riskid / piirangud

- **Token leke** Action seadetes või logides → TURVA + rotate.  
- Mudel võib **vale formaadis** aega saata → vajab selget skeemi või Jarvisi poolel parserit (eraldi samm).  
- **Rate limit** puudub bridge’il osaliselt → jälgida abuse.  
- **PATCH** update bridge’is võib olla `NOT_IMPLEMENTED_YET` — Actions ei tohi seda müüa kui valmis.

## 7. Järgmine ehitussamm

**Üks** lõpuni testkeskkond: avalik TLS + `JARVIS_BRIDGE_TOKEN` + GPT teeb **health** + **üks** kontrollitud `POST /bridge/v1/calendar/events` testkirjega; dokumenteeri kasutatud URL ja tokeni hoiukoht (mitte repo).

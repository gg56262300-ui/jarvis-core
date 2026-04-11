# ChatGPT ↔ Jarvis bridge — OpenAPI plaan (kompaktne)

## 1. Eesmärk

Määratleda **OpenAPI 3** struktuur bridge API-le, mis rakendab `CHATGPT_JARVIS_BRIDGE.md` ja `CHATGPT_JARVIS_BRIDGE_COMMANDS.md` ilma tegeliku koodita selles failis. Tulemus on **mustand**, mida EHITAJA saab järgmisena realiseerida Operating Modeli järjekorras.

## 2. Baas-URL kuju

- **Prod / staging:** `https://{bridge-host}/bridge/v1` (fikseeritud versiooniprefiks).  
- **Health** võib olla ka `GET /health` proxy taga samal hostil (eraldi `info` objekt OpenAPI-s).  
- **Ei kasutata** `http://localhost` välisklientide jaoks.

## 3. Auth skeem

- **Soovitus:** `securitySchemes.bearer` (JWT või lühiajaline access token) *või* `apiKey` päises `X-Jarvis-Bridge-Key` + TLS; valik **üks** primaarne, teine dokumenteeritud alternatiivina.  
- **security** rakendatud **globaalselt** kõigile `/bridge/v1/*` teedele peale dokumenteeritud healthi (kui avalikult lubatud — vaikimisi mitte).  
- Scope ei ole OpenAPI-s “magic”: iga `operationId` = üks lubatud käsk (vt käskude leping).

## 4. Read endpointid

Kõik **GET** või **POST** fikseeritud kehaga (kui päring on keerukas), üks teekond ühe käsu kohta:

| Tee (näide) | operationId | Käsu ID (lepingust) |
|-------------|-------------|---------------------|
| `GET /bridge/v1/health` | `bridgeHealth` | `health` |
| `GET /bridge/v1/calendar/today` | `calendarToday` | `calendar.today` |
| `GET /bridge/v1/calendar/next` | `calendarNext` | `calendar.next` |
| `GET /bridge/v1/calendar/upcoming` | `calendarUpcoming` | `calendar.upcoming` |
| `POST /bridge/v1/contacts/search` | `contactsSearch` | `contacts.search` |
| `GET /bridge/v1/crm/leads` | `crmLeadsList` | `crm.leads.list` |

Päringu parameetrid (limit, query string) fikseeritud `parameters` ja `schema` kaudu.

## 5. Write endpointid

Kõik **POST**, fikseeritud `requestBody` JSON-skeem:

| Tee (näide) | operationId | Käsu ID |
|-------------|-------------|---------|
| `POST /bridge/v1/calendar/events` | `calendarEventCreate` | `calendar.event.create` |
| `PATCH /bridge/v1/calendar/events/{id}` | `calendarEventUpdate` | `calendar.event.update` |
| `POST /bridge/v1/crm/leads` | `crmLeadCreate` | `crm.lead.create` |

`{id}` asemel võib leping näha `title+start` režiimi — üks variant OpenAPI-s, mitte kaks lõdvat.

## 6. Request/response standard

- **Request:** `application/json`; ühised väljad valikuliselt `BridgeRequest` komponent (nt `locale`, `client_request_id`).  
- **Response:** `application/json`; ühine `BridgeResponse` komponent: `ok`, `command_id`, `data`, `error` (`code`, `message`), valikuline `meta`.  
- **401/403/429/503** — HTTP standard + `BridgeError` keha, kus võimalik.  
- **authorization_required:** HTTP **200** + `ok: false` + struktureeritud `error` *või* **401** — **üks** valik kogu API-s; dokumenteeri ühes kohas.

## 7. Idempotency reegel

- Kõik **write** `operationId`-d: parameeter `header` `Idempotency-Key` (**required: true**).  
- OpenAPI kirjeldus: sama võti + sama meetod + sama tee = identsete päringute korduv käitlemine (vastus 200 + sama `data` või 409 vastavalt poliitikale — **üks** reegel dokumentis).

## 8. Deny-by-default

- OpenAPI failis on **ainult** käesolevas plaanis ja `CHATGPT_JARVIS_BRIDGE_COMMANDS.md` loetletud teed.  
- **Ei** lisa `/{wildcard}` ega “generic command” endpointi.  
- Uus tee = uus rida plaanis + uus käsk lepingus + TURVA.

## 9. Järgmine ehitussamm

Genereeri **tõeline** `openapi.yaml` (või `openapi.json`) repo `docs/` või `spec/` alla, sidu see CI-s lintiga (`spectral` vms), seejärel EHITAJA: implementatsioon üks endpoint korraga allowlistiga vastavalt `JARVIS_TEAM_OPERATING_MODEL.md`.

# ChatGPT ↔ Jarvis bridge — käskude leping (minimaalne)

## 1. Eesmärk

Fikseerida **täpne minimaalne** käskude kontrakt, mida ChatGPT (või teine väline klient) tohib bridge’i kaudu kutsuda. Kõik ülejäänu on **keelatud**, kuni ARHITEKT + TURVA + Operating Model ei lisa uut kirjet.

## 2. Read käsud

| ID | Kirjeldus | Eesmärk |
|----|-----------|---------|
| `health` | Süsteemi elusolek | Kontroll enne teisi päringuid |
| `calendar.today` | Tänased sündmused (lühike nimekiri) | Lugemine |
| `calendar.next` | Järgmine sündmus | Lugemine |
| `calendar.upcoming` | Lähiaja sündmused (piiratud arv) | Lugemine |
| `contacts.search` | Kontakti otsing (kitsendatud päring) | Lugemine |
| `crm.leads.list` | Leadide / pipeline lühivaade (kui CRM API olemas) | Lugemine |

Konkreetne HTTP tee ja skeem seotakse **ühe** OpenAPI mustandiga (järgmine samm).

## 3. Write käsud

| ID | Kirjeldus | Tingimus |
|----|-----------|----------|
| `calendar.event.create` | Üks sündmus (pealkiri, algus, lõpp, valikuline asukoht) | **Idempotency-Key** kohustuslik; skeem fikseeritud |
| `calendar.event.update` | Olemasoleva sündmuse muutus (kitsendatud väljad) | Idempotency + identifikaator (id või pealkiri+algus reeglid dokumentis) |
| `crm.lead.create` | Uus lead minimaalsete väljadega | Ainult kui CRM protsess lubab; idempotency |

Kirjutavaid käske **ei laiendata** ilma eraldi otsuseta.

## 4. Keelatud käsud

- Suvaline **shell / käsurea** või skripti käivitus  
- **Piiramatu** tekstikäsk otse Google’i kontole  
- **Täielik** inbox / Gmail sisu ilma kitsenduseta  
- **Kustutus** ilma eraldi poliitika ja kinnituse reegliteta  
- Mis tahes tee, mis **pole** käesolevas dokumendis ja allowlistis kirjas  

## 5. Sisendväljad

Iga käsk kasutab **fikseeritud JSON-skeemi** (OpenAPI `requestBody`):

- Ühised (kui kasutusel): `locale` (nt `et-EE`), `client_request_id` (korrelatsioon, ei asenda idempotency’t)  
- **Ei tohi** sisaldada: paroole, OAuth koode, täis refresh tokeneid, suvalisi URL-e ilma allowlistita  

## 6. Vastuse kuju

Ühtne ümbris (loogiline, mitte implementatsioon):

- `ok`: boolean  
- `command_id`: string (kutsutud käsu id)  
- `data`: objekt või null (tulemus)  
- `error`: `{ code, message }` või puudub õnnestumisel  
- `meta`: valikuline (nt `rate_limit_remaining`) — **ilma** PII ja secretideta  

`authorization_required` olek peab olema **samasisuline** Jarvisi olemasoleva kanali mudeliga (authUrl jms ilma lekketa).

## 7. Auth ja idempotency reegel

- **Auth:** server-server; bridge kontrollib identiteeti enne Jarvis core’i; scope **ainult** käskude alamhulk.  
- **Idempotency:** iga **write** päring peab kandma `Idempotency-Key` (või vastava välja); sama võti + sama käsk = **sama** mõju, mitte topeltkirje.  
- Lühiajalised tokenid; võtmete rotate; **ei logita** täis päringu keha ega salasid.

## 8. Deny-by-default reegel

Kõik, mis **pole** käesolevas lepingus **ja** runtime allowlistis, on **keelatud**. Uus käsk = uus dokumentatsioonirida + TURVA + EHITAJA scope.

## 9. Järgmine samm

Koosta **OpenAPI 3** mustand: iga read/write käsk = **üks** `operationId`, fikseeritud tee (nt `/bridge/v1/...`), täielik request/response skeem; seejärel OMANIKU JÄRELVALVE ja EHITAJA järjekord vastavalt `JARVIS_TEAM_OPERATING_MODEL.md`.

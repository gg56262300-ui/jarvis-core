# ChatGPT ↔ Jarvis secure remote bridge — kompaktne spetsifikatsioon

## 1. Eesmärk

Jarvis peab olema kättesaadav **igast seadmest ja võrgust** (sh ChatGPT Actions), **mitte localhost-põhiselt**. Käsk peab minema **turvaliselt** Jarvis API-sse ja sealt edasi kalendrisse, kontaktidesse ja CRM-i üle **kontrollitud värava**.

## 2. Järeldus

Üks **bridge-kiht** (avalik TLS + autentimine + allowlist): väline klient kutsub **ainult** bridge’i; bridge edastab **valideeritud** päringud Jarvis core’ile. Bridge ei asenda CRM-i ega kalendrit — ta on **värav**, mitte uus ärikiht.

## 3. Vajalikud kihid

| Kiht | Roll |
|------|------|
| **DNS + TLS** | Avalik või kontrollitud host, kehtiv sert. |
| **Edge / reverse proxy** | TLS lõpetus, põhipäised, võimalik WAF. |
| **Bridge API** | Auth, scope, rate limit, idempotentsus (kirjutavatele), logid ilma secretideta. |
| **Jarvis core** | Integratsioonid (calendar, contacts, CRM); ei usalda välispäringut ilma bridge’i kontrollita (või ainult sisetraafik + bridge). |
| **Ops** | Võtmete pööramine, monitooring, audit. |

## 4. Turvanõuded

- **Tugev kliendi autentimine**: server-server (OAuth, API key + võimalik mTLS); minimaalne scope.
- **Rate limit** ja abuse kaitse; **idempotentsus** ohtlikele kirjutavatele käskudele.
- **Ei logita** täis OAuth koodi ega salasõnu; kehade logimine minimaalne.
- **Võtmete rotate** võimalus.
- **Allowlist**: ainult määratud meetodid ja teed.

## 5. Miks localhost ei sobi

ChatGPT ja mobiil/tahvel ei ole Jarvisi masinas. **Localhost** on ainult selle masina jaoks; väline klient ei jõua sinna. Tunnelid ilma TLS + auth’ita on **riskantsed** ja halvasti auditeeritavad. Nõue on **internetis resolve’itav, autenditud otspunkt**.

## 6. Minimaalne käskude jaotus

**Read (madalam risk)**  
- tervis / staatus  
- kalendri lugemine (lühike vaade)  
- kontaktide / CRM-i **lugemine** (kitsendatud väljad)

**Write (kõrgem risk — alati kinnituse või idempotentsuse reeglid)**  
- kalendri loomine / muutmine (kitsendatud skeem)  
- kontakti / leadi loomine või uuendus (CRM protsessi järgi)  
- **mitte** “üldine shell” ega piiramatu tekstikäsk

Konkreetne nimekiri fikseeritakse enne implementatsiooni **ühes** OpenAPI / marsruudiloendis.

## 7. Deny by default reegel

Kõik, mis **pole** allowlistis ja **pole** eksplitsiitselt dokumenteeritud, on **keelatud**. Uus käsk = uus otsus (ARHITEKT + TURVA) + uus kirje allowlistis.

## 8. Järgmine samm

Koosta **üks** tehniline lõik: valitud **baas-URL**, **üks** auth-mudel (nt OAuth vs API key), ja **täpsem** read/write teede nimekiri (OpenAPI mustand või tabel) — seejärel EHITAJA scope vastavalt Operating Modelile.

# Jarvis Idea Inbox — kompaktne spetsifikatsioon

## 1. Eesmärk

Üks **canonical capture-kiht** toorsisenditele (sh häälmärkmed, projektimõtted, pooleliolevad ideed). Siit edasi liiguvad asjad **ainult** selge triaaži või promote-sammu kaudu teistesse kihtidesse. Kalender, CRM ja Kanban **ei ole** vaikimisi inbox.

## 2. Paigutus

- **Loogiline koht:** Project Memory / Docs; salvestus **fail või DB** (`ideas` / `inbox` — tulevane implementatsioon).
- **Ei kuulu siia primaarselt:** Calendar, CRM, Kanban, WhatsApp, Miro kui ainus hoidla.
- **Hääl:** allikas (`source=voice`), mitte eraldi “hoidla”.

## 3. Valgusfoor

| Tuli | Tingimus |
|------|----------|
| 🟢 **KORRAS** | Kirje salvestatud, minimaalsed väljad olemas, otsitav. |
| 🟡 **TÄHELEPANU** | Triaaž puudub või `next_action` ebamäärane. |
| 🔴 **STOPP** | Idee suunatakse otse kalendrisse/CRM-i; scope lekib kanalitesse ilma sammuta. |

## 4. Väljad

| Väli | Kirjeldus |
|------|-----------|
| `title` | Lühike pealkiri |
| `raw_content` | Toortekst / transkript |
| `source` | `voice` \| `text` \| … |
| `project` | Valikuline projekt / kontekst |
| `created_at` | Ajatempel |
| `type` | `idea` \| `note` \| … |
| `status` | Vaata jaotist Staatused |
| `next_action` | Soovituslik järgmine samm (tekst või link) |
| `related_contact` | Valikuline seos |
| `related_links_or_files` | Valikulised viited |

**Otsingu miinimum:** `title`, `created_at`, `source`, `project`, `status`, `type`.

## 5. Staatused

`captured` → `triaged` → `promoted` **või** `archived`.

Valikuliselt: `duplicate`, `karantiin` (kooskõlas Prügikast / Koristaja rolliga).

## 6. Üleminekureeglid

| Siht | Tingimus |
|------|----------|
| **Ülesanne** | Pärast triaaži: selge tegevus + eeldus; eraldi task või seos `next_action`-ile. |
| **Kanban** | Ainult kui on tööüksus ja voog (nt backlog/doing); mitte enne. |
| **CRM** | Ainult kui on kontakt / lead / deal seos; muidu inbox või märkus. |
| **Calendar** | Ainult kui on **konkreetne aeg või kohustus**; muidu mitte. |
| **Knowledge** | Kui sisu on stabiilne, korduv, viidatav (dokument/fakt), mitte toor-hääljälg. |

Üks promote-samm = **üks** siht korraga (vältida automaatset hargnemist).

## 7. Allowed / Blocked

**ALLOWED:** inboxi CRUD; otsing/filter; “promote” ühe sihtkoha suunas; Voice → **ainult** kirje lisamine inbox’i.

**BLOCKED:** Calendar/CRM/Kanban kui vaikimisi capture; parseri lai ümberkirjutus; üks sisend → mitu kanalit ilma samm-sammulise kinnituseta.

## 8. Järgmine samm

Implementatsioon: **üks** salvestuskoht (fail või tabel), **üks** minimal API või skript (append + list + otsing), Voice integratsioon **ainult** appendina — pärast OMANIKU / ARHITEKT / scope kinnitust.

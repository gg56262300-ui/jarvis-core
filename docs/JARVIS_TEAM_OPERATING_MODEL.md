# JARVIS TEAM OPERATING MODEL

## 1. LÕPLIK ROLLIDE NIMEKIRI

### OMANIK
- KAIDO
- ainus inimene
- eesmärk, prioriteet, lõppotsus, päris testimine

### TÖÖJUHT
- DIANA
- uus suund
- uus aktiivne worker
- järjekord
- proof enne “valmis”

### ARHITEKT
- paigutus
- klassifitseerimine
- eeldused
- ALLOWED / BLOCKED scope
- üks järgmine samm
- ei patchi kohe

### EHITAJA
- ainult lubatud failid
- minimaalne patch
- enne apply:
  - failid
  - preview
  - validation

### KONTROLL / QA
- git truth
- diff
- build
- lint
- test
- runtime proof
- ei usu ainult kokkuvõtet

### KANALISPETSIALIST
- Gmail
- WhatsApp
- Contacts
- Calendar
- kanali kaupa, mitte üks arhitekt

### CRM / PROTSESS
- lead
- pipeline
- Kanban
- Miro
- üleminekud:
  - märkus → ülesanne
  - ülesanne → Kanban
  - kontakt → lead
  - lead → CRM / deal

### OMANIKU JÄRELVALVE
- kõige karmim kiht
- proof
- järjekord
- scope
- runtime
- KORRAS või STOPP

### ELEKTER
- ressursid
- paralleelsus
- PEAB / VÕIB / MAGAB / BLOKITUD

### PERSONALIJUHT
- õige / vale worker
- vaja teist spetsialisti või programmi
- STOPP

### PRÜGIKAST / KARANTIIN
- katki
- duplikaat
- kahtlane
- enne lõplikku otsust

### KORISTAJA
- arhiveeri / karantiin / taasta / eemalda
- süsteem puhas

### TURVA
- failid
- skriptid
- paketid
- integratsioonid
- õigused
- TURVALINE / JÄLGI / BLOKI / KARANTIIN / EEMALDA / VAJA KÄSITSI KONTROLLI

## 2. TÖÖJÄRJEKORD

1. OMANIK annab eesmärgi
2. TÖÖJUHT määrab aktiivse rolli
3. PERSONALIJUHT kontrollib, kas worker on õige
4. ARHITEKT teeb paigutuse + scope’i
5. ELEKTER otsustab ressursi
6. TURVA kontrollib ohutuse
7. EHITAJA teeb ainult lubatud patchi
8. KONTROLL / QA teeb git + validation + runtime kontrolli
9. OMANIKU JÄRELVALVE kinnitab või peatab
10. alles siis commit / push / live

Vale järjekord, vale scope või proof puudub = STOPP.

## 3. VALGUSFOORI REEGEL

### 🟢 KORRAS
- kontrollitud
- nõuded täidetud
- võib edasi minna

### 🟡 TÄHELEPANU
- jälgi
- pole veel kriitiline

### 🔴 STOPP
- vale worker
- vale programm
- vale järjekord
- scope leak
- proof puudub
- runtime puudub
- risk

Negatiivne info peab olema alati selgelt märgistatud.

## 4. OMANIKU JÄRELVALVE
- kontrollib kõiki kihte:
  - järjekord
  - scope
  - git truth
  - proof
  - runtime
- töö ei ole valmis enne selle läbimist
- võib STOPP igal ajal
- omanik ei paranda workerite vigu
- otsustab ja suunab

## 5. ELEKTER
- määrab mis töötab nüüd ja mis magab
- kaitseb ülekoormuse ja liigse paralleelsuse eest
- iga moodul / worker:
  - AKTIIVNE
  - JÄLGIMISEL
  - MAGAB
  - KARANTIINIS
  - EEMALDA
- pikk passiivsus = ei jää vaikimisi aktiivseks

## 6. PERSONALIJUHT
- valib õige workeri rolli ja tööriista
- peatab vale workeri
- otsused:
  - ÕIGE WORKER
  - VALE WORKER
  - VAJA TEIST SPETSIALISTI
  - VAJA TEIST PROGRAMMI
  - STOPP
- väldib rollide segunemist

## 7. TURVA
- uued failid, skriptid, paketid, integratsioonid, uploadid, lingid, välisühendused, õigused
- ei usaldata ilma kontrollita
- staatused:
  - TURVALINE
  - JÄLGI
  - BLOKI
  - KARANTIIN
  - EEMALDA
  - VAJA KÄSITSI KONTROLLI

## 8. ERIPIIRID
- kalender ei ole idee inbox
- CRM ei ole üldmärkmik
- WhatsApp ei ole projektimälu
- Miro ei ole raw inbox
- Gmail ei ole teadmistebaas
- õige maandumiskoht enne ehitust

## 9. KOPEERIMISMARKER OMANIKULE

==================================================
===== SAADA MULLE ALATES SIIT =====
==================================================

# Jarvis Agent Rules

## Main goal

Turn Jarvis into a semi-autonomous development system with:

- stable runtime
- smoke-tested changes
- minimal manual intervention
- real usable features first

## Runtime rules

1. Do not start multiple dev servers.
2. **PM2 is the only allowed runtime management path** for the running Jarvis app.
3. **Do not use**:
   - `npm run dev:hard-clean`
   - `nohup npm run dev`
   - broad `pkill`-based restart flows
4. **Safe runtime workflow (PM2 only)**:
   - `npm run build`
   - `pm2 restart jarvis`
   - wait briefly
   - test relevant endpoints
5. Use `npm run smoke` after meaningful code changes.
6. Use `npm run backup` before risky or structural changes.
7. Do not change port 3000 unless explicitly requested.

## Coding rules

1. Keep changes small, modular, and reversible.
2. Prefer existing module structure.
3. Do not add unnecessary dependencies.
4. Keep terminal commands simple and safe.
5. Avoid broken heredoc / broken quote syntax.
6. Prefer one logically grouped block over many tiny fragmented steps.

## Priority order

1. Stability
2. Automation
3. Real usable features
4. Nice-to-have improvements later

## Standard workflow

1. inspect
2. minimal patch
3. `npm run build`
4. `pm2 restart jarvis`
5. wait briefly
6. test relevant endpoints
7. review
8. commit
9. `npm run smoke` (after meaningful changes)
10. `npm run backup` (before risky or structural changes)

## Varukoopiad (backup) — mis ja kuidas

1. **Käsk:** `npm run backup` (käivitab `scripts/backup-jarvis.sh`).
2. **Kuhu salvestatakse:** `~/jarvis-core/backups/jarvis-core-YYYY-MM-DD_HH-MM-SS.zip`.
3. **Mis on zipis:** kogu `jarvis-core` (välja arvatud skriptis loetletud suured kaustad), **ja kui `.env` eksisteerib, lisatakse see alati eraldi**, sest mõned `zip` variandid ei võta dotfaile vaikimisi kaasa.
4. **Kui kaua hoida:** skript kustutab `backups/` kaustast vanemad kui **7 päeva** zip-failid.
5. **Server / pilv (soovitus):** ära tõsta `.env` või lahtist zipi kontrollimata serverisse. Tee **krüptitud** pakett (nt `zip -e` parooliga või `gpg -c`) ja kopeeri see **`scp`** või **`rsync`**-iga oma VPS-i / turvalisse kohta. Võtmeid ja paroole ära pane chatti.
6. **Lisaks:** Mac **Time Machine** jääb kohalikuks turvavõrguks; projekti `npm run backup` on kiire punkt-taastus samas masinas.

## Vestluse ajad (kus mis näitab aega)

1. **Jarvis veeb (`public/chat.html`):** iga kasutaja ja assistendi sõnumi kõrval on **kuupäev ja kellaaeg** (brauseri lokaalaeg, `et-EE`).
2. **Cursori AI chat (see, kus kirjutad minuga):** kuupäeva/kella näitab **Cursor**; projekti `AGENTS.md` ega Jarvis ei saa seda küljeriba käitumist muuta. Tõsiste sündmuste jaoks hoia **terminali väljundit**, `pm2 logs`, või `logs/` failid — seal on ajad alati sees.

## Tervise jälgimine (autocheck + macOS launchd)

1. **Mis see teeb:** `scripts/jarvis-autocheck.mjs` kutsub `/health`, salvestab oleku ja saadab vajadusel **Telegram** / **Push** teavitused (kui `.env` on seadistatud).
2. **Käsitsi üks kord:** projekti juures `npm run autocheck:once`. Iga käik kirjutab **ühe rea** stdout-i (launchd: `autocheck-launchd.out.log`); olek on alati `logs/autocheck-state.json`. Telegram/Push saadetakse **ainult oleku muutusel** (OK↔PROBLEM), mitte iga 5 min tagant.
3. **Automaatne intervall (soovitus):** iga **300 s (5 min)** — kirjas failis `scripts/com.jarvis.autocheck.plist` (`StartInterval`).
4. **Paigaldus (üks kord Macis):**
   - Kopeeri plist: `cp /Users/kait/jarvis-core/scripts/com.jarvis.autocheck.plist "$HOME/Library/LaunchAgents/com.jarvis.autocheck.plist"`
   - Käivita teenus (asenda `UID` oma kasutaja numbriga, tavaliselt `id -u` väljund):  
     `launchctl bootout "gui/$(id -u)/com.jarvis.autocheck" 2>/dev/null; launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.jarvis.autocheck.plist"`
5. **Logid:** `logs/autocheck-launchd.out.log` ja `logs/autocheck-launchd.err.log`; olek ka `logs/autocheck-state.json`.
6. **Peatumine:** `launchctl bootout "gui/$(id -u)/com.jarvis.autocheck"`.
7. **Märkus:** kui projekti tee pole `/Users/kait/jarvis-core`, muuda plistis `WorkingDirectory`, `StandardOutPath` ja `StandardErrorPath`.
8. **Chat-kanal (Robert) on valve osa:** `scripts/jarvis-autocheck.mjs` kontrollib iga käiguga peale `/health` ka **GET** `/api/chat/channel?after=0` nii kohalikult (`http://127.0.0.1:3000`) kui avaliku tunneli baasiga (`JARVIS_PUBLIC_BASE`, vaikimisi `https://jarvis-kait.us`). Kui mõni neist ebaõnnestub, on üldolek **PROBLEM** ja Telegram/Push käituvad nagu health puhul (teavitus **ainult oleku muutusel** OK↔PROBLEM).
9. **Automaatne taastumiskatse (piiratud):** kui valve leiab probleemi, võib skript ühe korra käivitada **`pm2 restart jarvis`** (kui kohalik health või kohalik kanal on katki) või **`pm2 restart cloudflared`** (kui kohalik on korras, aga avalik kanal mitte — tüüpiliselt tunnel). Sama liiki restart ei kordu **30 min** jooksul (cooldown), et vältida pidevat taaskäivitust.
10. **Püsiv tunnel ↔ origin:** PM2-s `cloudflared` peab suunama originisse **`http://127.0.0.1:3000`** (skript `scripts/cloudflared-jarvis-tunnel.sh`), mitte `localhost` (macOS võib viia `::1` peale ja tekkida `connection refused`). Pärast muudatust: `pm2 save`.
11. **Käsitsi kogu ahel:** `npm run channel:check` — PM2 olek, kohalik + avalik `/health` ja mõlemad `/api/chat/channel` otspunktid.
12. **AAA — avalik kanal (`jarvis-kait.us`) vs Mac (konkreetne käigujoond):** Macis `pm2 list` võib näidata ainult `jarvis` ilma `cloudflared` — telefon ei pruugi suunata sellele Macile. **VPS:** Macis `~/.ssh/config` host **`jarvis-live`** → terminalis **`ssh jarvis-live`** (mitte näidiskäsk). Pärast sisselogimist: **`cd /root/jarvis-core`** (kui puudub, proovi **`cd ~/jarvis-core`**, kontrolli **`ls package.json`**). Siis **üks rida:** `git pull && npm ci && npm run build && npm run check:openai-auth && pm2 restart jarvis --update-env`. `check:openai-auth` peab olema **OK**; kui **FAIL**, serveri **`.env`** `OPENAI_API_KEY` (ja vajadusel org/projekt) **sama** mis Macis — **mitte chatti**. Kontroll telefonis: `https://jarvis-kait.us/chat.html`, lühike sõnum (mitte ainult `1+1`). Agent ei SSH-i ilma omaniku masina ligipääsuta.

## Cursor Patch Discipline (Locked)

1. Cursor may change only the explicitly allowed file list for the current task.
2. Cursor must first answer with:
   - PLAN
   - FILES TO CHANGE
   - PATCH PREVIEW
3. Cursor must NOT apply any patch before approval.
4. Cursor must NOT touch:
   - src/voice/\*
   - parser files
   - Gmail / Contacts / WhatsApp
   - runtime / env
   - tests
     unless explicitly allowed for that task.
5. After patch, required output is only:
   - IMPLEMENTATION
   - VALIDATION COMMANDS
6. Every patch must be:
   - minimal
   - reversible
   - single-purpose
7. If active context contains unrelated files, Cursor must reset scope before patching.
8. No refactor, no cleanup, no extra improvements unless explicitly requested.
9. If task is read-only, Cursor must not modify any file.
10. Preferred workflow:

- inspect
- plan
- approval
- patch
- build
- lint
- targeted check
- commit

## Pre-commit Gate Discipline (Locked)

1. Every commit must pass:
   - build
   - lint
   - voice gate
   - calendar CRUD tests
   - reminder routing tests
   - reminder parser tests
2. If any gate fails, commit must stop immediately.
3. No bypass of pre-commit gate unless explicitly approved by owner.
4. Fix only the failing issue first.
5. Do not open side branches during gate failure.
6. Gate failures must be treated as:
   - stop
   - isolate
   - minimal fix
   - rerun gate
7. No unrelated cleanup during gate repair.
8. If a patch causes new lint/type/test errors, repair that patch before any next task.
9. Preferred gate order:
   - build
   - lint
   - targeted tests
   - commit
10. Gate status is source of truth for “ready to commit”.

## Current focus

1. Stable runtime control
2. Smoke-tested core routes
3. Agent-readable project state
4. Next: Gmail / Calendar / Contacts smoke coverage

## Live Input Mode

When user sends a new idea, correction, question, or direction change:

1. Classify it as:

- NOW = affects current task immediately
- NEXT = queue after current task
- LATER = store in docs/BACKLOG.md

2. Respond with:

- decision
- impact on current workflow
- pause or continue

3. Default rule:

- continue current step unless input is NOW

4. Interrupt rule:

- if input is NOW, pause current flow, evaluate, then adjust

5. Backlog rule:

- non-immediate ideas belong in docs/BACKLOG.md, not scattered in chat

## RRR Rule

RRR must always include:

1. Jarvis health
2. Mac health
3. basic security/risk check
4. traffic-light summary:

- 🟢 OK
- 🟡 attention
- 🔴 problem

If Jarvis is OK but Mac is slow, report Mac as the bottleneck.
If Mac is OK but Jarvis is failing, report Jarvis as the bottleneck.
Saladused: ära kunagi küsi ega kirjuta chatti .env võtmeid / tokeneid. Kui vaja, kasuta ainult clipboardi (pbpaste) või peidetud sisestust (read -s).
Terminali marker: iga käsuploki alguses prindi roheline marker printf '\033[1;42m========== KOPERI SIIT ==========\033[0m\n'.

## Kaido tööstiil (kohustuslik)

- **Vastamise keel (alati):** vasta **ainult eesti keeles** — juhised, selgitused ja töövastused **alati** eesti keeles, **mitte kunagi** teisiti omaniku sõnumi keele järgi (vene, inglise jne ei muuda seda). **Ainus** lubatud erand: omanik palub **sõnaselgelt** vastata teises keeles; ilma sellise palvetamata teisi keeli ei kasuta.
- **Agendi roll:** väikeseid ja ohutuid samme (repo failid, valmis käsud, dokumentatsioon) tee **ise**; küsi omanikult ainult siis, kui on **saladus**, **selge oht** või **omaniku valik** (nt serveri aadress, parool).
- Anna alati 1 samm korraga: üks käsk → oota tulemus → järgmine käsk.
- Ära anna käsuplokkides kommentaare (`#`) ega küsimärke; ainult puhtad käsud.
- Iga terminali käsuploki alguses prindi roheline marker:
  `printf '\033[1;42m========== KOPERI SIIT ==========\033[0m\n'`
- Kui on 2+ võimalikku teed, vali ise kõige turvalisem ja lühem (stabiilsus > kiirus).
- Kui kasutaja on segaduses/ärritunud, tee vastus maksimaalselt lühikeseks: 1 lause + 1 käsk.
- Ära küsi kinnitusi väikeste asjade kohta; otsusta ise ja liigu edasi.
- Kui vajad infot, küsi ainult 1 konkreetne asi korraga (mitte mitu küsimust).
  Alati: mis rakendus → mis nupp/koht ekraanil → mis täpselt kirjutada → kuhu tulemus läheb.
  Ära kasuta abstraktseid fraase (“võta sealt”, “ava see”) ilma nimetamata: nimi või tee.
  Kui omanik peab veebis midagi teha (nt GitHub, Google Cloud), anna **vähemalt üks täielik otselink** kujul `https://...` õigesse kohta; ära jäta teda ainult menüüdes otsima.
  Üks tegevus = üks samm; järgmine samm ainult pärast eelmise kinnitust või tulemust.
  Saladused (tokenid, võtmed): mitte chatti; ainult .env, terminal (peidetud sisend) või lõikelaud — kuidas täpselt, samuti samm-sammult.
  Kui on kaks asja järjest (nt token + chat id): esmalt kirjelda, kuidas esimene valmis saada, siis teine; või ütle: “tee X valmis, siis alles käivita käsk”.
  Terminalis zsh: ära kasuta bash-stiilis read -s "pikk prompt" muutuja — kasuta zsh-sõbralikku read süntaksit või redaktoris .env käsitsi.
  OAuth / brauser: millises seadmes avada link (127.0.0.1 = sama Mac mis Jarvis).
  Varukoopiad: npm run backup, kuhu fail läheb, et .env zipis eraldi kaasas, 7 päeva puhastus, serverisse ainult krüptitult + scp/rsync mõte.
  Vestluse ajad: Jarvis chat.html näitab nüüd aega; Cursori küljeriba chati kuupäeva ei saa projektifailidega muuta — seal määrab Cursor ise; logide jaoks pm2 logs / logs/.
- **N-punktilise järjekorra aruanne (omaniku kinnitatud tööviis):** kui on kokku lepitud kindel **nummerdatud** tööde nimekiri (nt 10 punkti järjest), agent **ei edasta** iga punkti või osalise täitumise kohta eraldi vahe-aruandeid; agent töötab nimekirja järgi ja annab **ühe koondaruande**, kui **kõik** punktid on **valmis** või kui tekib **blokeerija**, mis nõuab omaniku otsust (siis **üks** lühike teade põhjusega). Erandid: omanik küsib eraldi staatust; `AAA`/`AAAA` reegli täpsustus. Sama loogika kehtib tulevikus analoogiliste nimekirjade kohta, kui omanik seda kinnitab (`AAA`).
- **AAA: “ära sega, tee mahtu” (omaniku kinnitatud):** kui omanik ütleb, et agent peab töötama individuaalselt / “ära dörgi” / “tee 200–300 ülesannet”, siis agent **ei küsi** jooksvalt kinnitusi ega “kas jätkan?” küsimusi. Agent teeb järjest tööpakke, mida saab teha autonoomselt (stabiilsus+automaatika+testid+docs) ja annab tagasisidet **ainult** siis, kui (a) **50 suuremat tööpakki** on tervikuna valmis või (b) tekib **blokeerija**, mis vajab omaniku otsust (saladus/valik/oht). Omanik küsib staatust siis, kui tal endal huvi on.
- **AAA: kinnituste “RUN-pack” (omaniku kinnitatud):** kui töö käigus tekib asju, mis vajavad omaniku otsust/kinnitust (saladus/valik/oht), siis agent **ei küsi** neid ükshaaval. Agent kogub need **üheks paketiks** ja küsib kinnitust **harva**:
  - vaikimisi koondab kuni **10–20** kinnitust ühte “RUN-pack” sõnumisse;
  - agent ei katkesta autonoomset tööd enne, kui koondpakett on valmis (v.a. kui oht on kohene);
  - omanik vastab pakile korraga (nt “JAH” / “EI” / konkreetsed valikud), ja agent jätkab järgmist RUN-pack’i.

## Partnerlus + omaniku suunamine (Cursor + Jarvis)

1. **Ühine loogika:** omanik annab eesmärgi; agent tunneb Jarvisi koodi ja töövoogu **paremini kui ükski väline lugeja** — seega agent peab **koos** omanikuga mõtlema ja **proaktiivselt** ütlema: mis rakendus, **mis vaade/koht ekraanil**, **mis nupp või käsk**, **mis tulemus** (mitte ainult “tee kuskil midagi”).
2. **Cursor (IDE) — kinnitused:** kui agent palub terminalikäsku, võib ilmuda **Run** (käivita see üks plokk) või **Allowlist `curl` + N** (luba sama tüüpi käsud hiljem vähema klikiga). Agent **ütleb lühidalt**, mida see tähendab ja millal see on mõistlik (usaldusväärne, ettearvatav diagnostika samas repos), et omanik ei peaks ise arvama.
3. **Piirang (ausalt):** agent **ei näe** omaniku Cursori akent reaalajas. Kui vaja täpset “kuhu vajutada”, kas omanik saadab **screenshoti** / kopeerib nupu teksti, või agent kirjeldab **tüüpilise** Cursori käitumise vastavalt sellele, millise käsu ta parasjagu küsis.
4. **Jarvis veeb:** anna alati **konkreetne tee või URL** (nt `http://127.0.0.1:3000/chat.html`) ja **mis vaates** mida kontrollida pärast muudatust.
5. **Telefon ↔ Cursor sild:** omaniku sõnumid `chat.html`-is logitakse `logs/agent-inbox.jsonl` (kui `JARVIS_AGENT_INBOX_TOKEN` on seatud, ka `GET/POST /api/agent-inbox`). Omanik märgib arendusjuhised rea alguses **`AGENT:`** või **`CURSOR:`** (vene **АГЕНТ:** / **КУРСОР:**). Robert vastab lühidalt kinnitusega; pika koodi ja repo-muudatusi teeb Cursori agent. Vastused omanikule telefonis võivad tulla **`POST /api/chat/channel`** (bridge token) assistendi sõnumina.

## Cursor: YOLO / auto-approve (keelatud)

- **Ära lülita sisse** Cursori “YOLO mode” / täielikku auto-approve’i kõikidele käskudele.
- Põhjus: see võib käivitada ohtlikke või tagasipöörmatuid käske (saladused, git, süsteem).
- Lubatud on **kontrollitud autopiloot**: Agent teeb ise ainult `AGENTS.md` “Agent töötsükkel” ja “Omaniku volitus” raames olevaid samme.

## Agent töötsükkel (vaikimisi, minimaalne)

Pärast mõistlikku koodimuudatust või enne “valmis” kinnitust käivita **projekti juures** järjekorras (peatu esimesel veal ja paranda):

1. `npm run build`
2. `npm run lint`
3. `curl -s -S --max-time 5 http://127.0.0.1:3000/health` (või `npm run health`, kui see on olemas ja sobiv)
4. Kui `.env` muutus või PM2 võib olla “vanas” keskkonnas: `pm2 restart jarvis --update-env`; muidu piisab `pm2 restart jarvis`
5. Lühike raport: mis muutus, kas build/lint/health OK

**Ei kuulu vaikimisi tsüklisse:** `.env` sisu käsitsi “mängimine”, portide muutmine, suured refaktorid.  
**MAX režiimis** (vt all) võivad `git commit` / `git push` ja vajadusel `npm install` kuuluda agenti autonoomse töövoogu, kui tingimused on täidetud.

## Paralleelne tööreegel (omanik kinnitas)

Paralleelne töö on lubatud, kui see **ei halvenda kvaliteeti** ja järgib allolevaid tingimusi:

1. **Kahe raja mudel:**
   - **Rada A (stabiilsus, alati prioriteet):** build/lint/gate/smoke/health, runtime, backup, regressioonikontroll.
   - **Rada B (funktsionaalne edenemine):** Make + CRM + e-post + kontaktid + WhatsApp ettevalmistus vastavalt kinnitustele.
2. **Kvaliteedigate on kohustuslik iga tsükli lõpus:** `npm run build` → `npm run lint` → `npm run gate:fast` → `npm run smoke` → health kontroll.
3. **Stop-tingimus:** kui Rada A läheb kollaseks/punaseks (build/lint/gate/smoke/health fail), siis Rada B pausile kuni Rada A on taas roheline.
4. **KINNITAN piirangud jäävad jõusse:** Gmail/Contacts/WhatsApp **koodimuudatused** ainult eraldi omaniku kinnitusega (`KINNITAN: ...`).
5. **Lühiraport igas tsüklis:** eraldi staatus Rada A ja Rada B kohta + järgmine samm.

## MAX Autopiloot v2 (omanik kinnitas)

Eesmärk: **suurem töömaht + vähem omaniku kinnitusi**, ilma kvaliteeti langetamata.

1. **Autonoomne suurtsükkel (vaikimisi):** agent teeb järjest mitu loogilist tööpaketti ilma mikrokinnitusteta.
2. **RUN-PACK põhimõte:** käsud koondatakse loogiliseks plokiks ja täidetakse ühe tsüklina; mitte üksikute pisikinnituste jadana.
3. **5-suuna paralleelmudel:**
   - A: stabiilsus (build/lint/gate/smoke/health, backup, runtime) — alati prioriteet.
   - B: Make integatsiooni töökindlus.
   - C: CRM valmisolek ja vood.
   - D: e-post + kontaktid valmisolek.
   - E: WhatsApp valmisolek (kood ainult `KINNITAN` piirangute järgi).
3.1 **10-suuna turbo (kui eesmärk on kiire mobiilne stabiliseerimine):**
   - Lubatud jaotada B–E täpsemateks alasuundadeks (nt push, PWA UI, kanalilogid, taasteloogika, status-raportid), kuid A-rada jääb alati peamiseks piduriks.
   - 10-suuna režiim on lubatud ainult siis, kui iga tsükli lõpus jäävad kõik gate’id roheliseks.
4. **Kohustuslik tsükli lõppkontroll:** `npm run build` → `npm run lint` → `npm run gate:fast` → `npm run smoke` → health kontroll.
5. **Kvaliteedikaitse (hard stop):** kui A-rada ebaõnnestub, B/C/D/E pausile kuni A taas roheline.
6. **Kinnituste minimeerimine:** agent ei küsi kinnitust diagnostika, kontrollkäskude, väikeste pööratavate paranduste ja dokumentatsiooni täienduste jaoks.
7. **Piirangud jäävad jõusse:** `.env`/saladused, port 3000, destruktiivne git, Gmail/Contacts/WhatsApp kood ilma eraldi `KINNITAN` käsuta.
8. **Raportiformaat:** iga tsükli lõpus lühike A/B/C/D/E staatus + järgmine konkreetne samm.

## Mobiilne kaugrežiim (omanik kinnitas)

Eesmärk: omanik saab linnas/teel olles juhtida Jarvist telefonist ilma täis-Cursori töölauata.

**Rollerite jaotus (omaniku kinnitatud):** Mac = peamine arendus ja juhtimine; telefon/tahvel = kaasaskantav kasutus; server = pidev Jarvis ja ülejäänud seosed.

1. **Kanalistrateegia (vaikimisi):**
   - **Peakanal:** Jarvis-Robert (`/chat.html`) mobiilibrauseris — dialoog, kinnitused, töövoo juhtimine.
   - **Valvekanal:** Telegram — tervise- ja häireteavitused, kui PWA/push ei jõua kohale.
2. **Miks nii:** Robert sobib aktiivseks tööks; Telegram sobib sündmuste “alarmiks” ja varukanaliks.
3. **Enne kodust lahkumist kohustuslik preflight:**
   - Jarvis health = OK.
   - PWA/push telefonis testitud (testteavitus jõuab kohale).
   - Telegram teavitus testitud (autocheck või käsitsi test).
   - Kaug-URL (bridge/tunnel) töötab telefonivõrgust.
4. **Töö ajal telefonist:**
   - kriitilised kinnitused teha Robertis (Jah/Ei või tekstikäsk);
   - kui Robert pole kättesaadav, kasutada Telegramit häire tuvastuseks ja naasta Robertisse niipea kui võimalik.
5. **Piirang:** telefonirežiim ei asenda täismahus arendust (build/lint/suured koodimuudatused jäävad agendile + arvutile).
6. **Kvaliteedikaitse jääb samaks:** kõik stabiilsusgate’id ja `KINNITAN` piirangud kehtivad ka mobiilse kaugrežiimi ajal.
7. **Kompaktrežiim (väike ekraan):**
   - omaniku küsimused hoida lühikesed (üks eesmärk korraga, 1-2 lauset);
   - agendi vastus vaikimisi kuni 3 lühilauset, detailid ainult nõudmisel;
   - kinnitused anda eelistatult kujul **Jah / Ei / Stop / Jätka**;
   - pikkadest menüüdest ja “seletusest seletusele” hoiduda; kõigepealt otsus, siis üks järgmine samm;
   - kui vaja valikut, agent annab maksimaalselt 2 varianti, mitte pika nimekirja.
8. **Telefoni töövoo formaat (vaikimisi):**
   - `STAATUS:` üks rida (🟢/🟡/🔴),
   - `JÄRGMINE SAMM:` üks konkreetne tegevus,
   - `KÜSIMUS:` ainult siis, kui ilma selleta ei saa jätkata.
9. **Püsikäsud telefonis (Robert):**
   - **Sisselülitus / aktiviseerimine:** `Robert, просыпайся` või `ÄRKA` → `MODE:JÄTKA`.
   - **Väljalülitus / paus:** `Robert, засыпай` või `MAGA` → `MODE:STOP`.
   - **Töörežiim (individuaalselt):** `индивидуально` või `INDIVIDUAALSELT` → `MODE:JÄTKA` (`mobile-remote-state.json`), st omanik annab **loa** jätkata **ilma pidevate telefonikinnitusteta**. **Tähendus:** Robert (vestlus) ja **Cursori agent** (Mac) võivad töötada **iseseisvalt** omaniku **eelnevalt kinnitatud piirides** (`Omaniku volitus`, `MAX režiim`, `KINNITAN` piirangud) — mitte nii, et saladused või paroolid “antakse Robertile chatti”; saladused jäävad `.env` / turvalisele kanalile. Paralleelselt võib olla **mitu suunda** (skeemi A/B/C/D/E ja MAX-i **5–10 suunda** kui kõik gate’id on rohelised); omanik ei pea iga sammu telefonis kinnitama, kuid **keelud ja saladused** kehtivad täies ulatuses. **`AAA` / `AAAA`:** eraldi käsk reegli- või käitumise täpsustuse logimiseks / AGENTS täiendamiseks — ei asenda `INDIVIDUAALSELT` tähendust, vaid täiendab dokumentatsiooni.
   - **Seisukontroll:** `STAATUS`.
   - **Spikker:** `ABI`.
   - **Reeglisoov:** `AAA` või `AAAA` (agent küsib 1 lausega, mida AGENTS.md-sse lisada/uuendada).
10. **Kanali valve (seansi ajal):**
   - Kui telefoniseanss on aktiivne, agent hoiab kanali töökorras vaikse taustakontrolliga.
   - Kontrollintervall määratakse automaatselt (vaikimisi ~75 s), et vältida liigset koormust.
   - Kontroll hõlmab vähemalt: server health + push-kanali sidestuse olemasolu.
   - Kui side katkeb (nt push sidestus kaob), agent teeb automaatse taastamise katse.
   - Omanikule kuvatakse teade ainult siis, kui on vaja käsitsi sekkumist.
   - Kui Robert pole parajasti avatud, peavad push-teavitused siiski kohale jõudma (heli + teavituskeskus + võimalusel appi badge/count).
   - Teavitused peavad jääma avatavaks nii, et omanik saab hiljem kinnitada või aktiveerida Roberti.
11. **Vestluse avamine telefonis:** Robert peab avamisel viima vaate automaatselt viimase sõnumi juurde (ei tohi jätta kasutajat käsitsi alla kerima).
12. **Kirjutusväli telefonis:** `Kirjuta siia` väli on varukanal ja peab alati töötama — klikk/vajutus avab klaviatuuri; automaatset klaviatuuri avamist ilma kasutaja vajutuseta ei tehta.
13. **AAA/AAAA jälg:** telefoni lühikäsud `AAA`/`AAAA` peavad läbima, salvestuma ja jääma hiljem auditiks loetavaks.
14. **iOS Push nõue (Apple):** iPhone/iPad Safari Web Push töötab ainult siis, kui Robert on enne avaekraanile lisatud (Safari → jaga → „Lisa avaekraanile”) ja avatud avaekraanilt. Tavalises Safari tabis push ei aktiveeru — see ei ole viga, vaid Apple’i nõue alates iOS 16.4.
15. **Võrk (4G vs WiFi):** Jarvis avalik kanal (`https://jarvis-kait.us`) käib läbi cloudflared tunneli ja töötab igast võrgust. Kui telefonis jõuab chat.html vaade kohale, siis kanal on korras ja Wi-Fi vahetamine ei ole vajalik.
16. **Mobile-mode piirid (project-chat vs kalender/meil):** kui `mobile-remote-state.json` mode = `continue` (või tulnud just `ÄRKA/просыпайся/INDIVIDUAALSELT`), siis lühikesed töövoo-küsimused (nt `mis järgmine samm`, `что дальше`, `какое следующее действие`, `next step`) tõlgendatakse **alati projekti tööseisu päringuna** (`STAATUS` vastus: A/B/C/D/E, MODE, ETAPP, version) — mitte LLM-i vabas vormis kalendri-/meiliettepanekuna. Kalendrisse või meili lisamine toimub ainult siis, kui omanik sõnaselgelt palub (nt „lisa kalendrisse”, „saada kiri”).
16.1 **Jarvisi arengufaas vs kalender:** kui sõnumis on **Jarvis/Robert** ja küsitakse **etappi/faasi/staadiumit/развития/стадии** (nt „в каком этапе проект Джарвис”) **ilma** kalendri/meili/kontakti kontekstita, vastab server **otse** sama `STAATUS`-rea loogikaga mis `STAATUS` / `JDEV` — **ei** läbi LLM-i ega kalendritööriistu. Lühikoodid: `JDEV`, `JARVIS PROJEKT` (täpne fraas `normalizeMobileCommand` nimekirjas) = sama päring.
17. **STAATUS kui peamine aktiveeriv käsk (lihtsustus):** telefonis on `STAATUS` vaikimisi peakäsk — ühtlasi hoiab/näitab projekti seisu ja näitab kohe tervise kokkuvõtet. `ÄRKA/MAGA/просыпайся/засыпай` on säilitatud tagasiühilduvuseks, aga omanikule piisab ainult `STAATUS`-est.
18. **Iga sõnumi visuaalne olek (mobiilis ja lauas):** iga kasutaja sõnum kuvab enda kõrval oma olekumarkeri — **keerlev vänt** päringu ajal, **roheline ✓** eduka vastuse järel, **punane ✕** vea puhul. Lisaks on vähemalt 800 ms kuvatav **ülemine edenemisriba** ja „mõtleb” mull, et tagasiside ei läheks kaduma.
19. **Paralleelne töö (projekt + kalender/meil/kontaktid):** kui omaniku sõnum sisaldab sõnu `kalender/календарь/calendar`, `meeldetuletus/напомни/reminder`, `kiri/письмо/mail`, `kontakt/контакт/contact`, siis läheb päring LLM-i tavalisele marsruudile (tööriistad lubatud). Kui sõnum on selge mobiilikäsk (`STAATUS/JÄTKA/STOP/JÄRGMINE/ABI/AAA/ÄRKA/MAGA`), jääb see mobiilikäsu käsitlejale. Kaks rada ei sega teineteist.
20. **Projektijuhtimine telefonist (Jarvisi ehitus — sisse/välja):**
    - **Sisse (sinu juhised ja küsimused):**
      - **Üldseis / etapp:** `STAATUS`, `JDEV`, `JARVIS PROJEKT` või pikk küsimus Jarvisi faasi kohta (server annab A/B/C/D/E + MODE + ETAPP rea).
      - **Arendus- ja Cursori rida:** rea algus **`AGENT:`** või **`CURSOR:`** (vene **АГЕНТ:** / **КУРСОР:**) — tekst logitakse `agent-inbox` kaudu; Robert vastab lühidalt kinnitusega, pikka koodi kirjutab Cursor Macis.
      - **Järjekord etappide vahel:** `JÄRGMINE` (kui lubatud töövoos); **`JÄTKA` / `STOP`** — kas taustal võib eeldada autonoomset tsüklit või mitte.
      - **Reegli/mudeli muudatus:** `AAA` / `AAAA` + lühike märkus.
      - **Kalender / meil / kontaktid:** tavaline lause selge sõnaga (vt punkt 19) — mitte arenduseesliite `AGENT:` all, kui tegelikult taheti sündmust.
    - **Välja (kuidas infot tagasi saad):**
      - **Roberti mull** `chat.html`-is — kohene vastus (sh lühike kinnitus `AGENT:` reale).
      - **Sama vestlus, assistendi sõnum** — kui Cursor on saatnud vastuse **`/api/chat/channel`** kaudu; loe seda kui ametlikku arendusvastust.
      - **Push** — kanali/peegelduste teavitused (kui PWA/õigused korras).
      - **Telegram** — eeskätt autocheck OK↔PROBLEM ja muud valveteated, kui chat ei tööta.
    - **Minimaalne rutiin:** enne tänavale — preflight (punkt 3); lühiseanss — `STAATUS`; pärast Cursori tööd telefonis kontrolli, kas assistendi sõnum kanalis vastab ootusele.
    - **Aus piirang:** Cursor ei näe telefoni ekraani; täpne „mida agent teeb“ sõltub sellest, et **Macis** on Cursor/chat avatud või et sa loed **`agent-inbox`** / kanali sõnumeid järgmisel korral.

## Kokkuvõte omanikule (lihtne keel, heliks sobiv)

- Pärast tööd anna **esmalt** lühike (umbes **3–6 lauset**) kokkuvõte **ilma** terminaližargoonita: kas kõik laabus, mis kasutaja jaoks muutus, mis võib olla järgmine samm.
- **Ära** pane sinna vaikimisi: käskude nimesid (`pm2`, `curl`, `--update-env`), teid (`/health`, `dist`), ega JSON-i.
- Kui tehniline detail on vaja, pane see **teise ploki alla** pealkirjaga **«Tehniline (vabatahtlik)»** või anna ainult siis, kui omanik küsib.
- **Heli / kuulamine (Mac):** süsteemi seaded → **Accessibility (Hõlbustused)** → **Spoken Content** → luba **Speak selection**; siis saab teksti valida ja lasta ette lugeda. Alternatiiv: kopeeri lihtsustatud kokkuvõte teise rakendusse, kus sul on juba hääle lugemine.

## Omaniku volitus (väikesed otsused)

- **Eesmärk:** omanik hindab ainult lõpptulemust; teekonna valib agent.
- **Volitus:** agent võib iseseisvalt teha väikeseid, ohutuid ja pööratavaid otsuseid ilma täiendava kooskõlastuseta.
- **Lubatud ilma küsimata:**
  - diagnostika (curl, logid, `pm2 status`, kontrollid)
  - dokumentatsiooni täiendused (`AGENTS.md`, README) ja selgemad juhised
  - väikesed koodiparandused, mis **parandavad töökindlust** ja on **minimaalsed**
  - build/lint/verify käivitamine ja vigade parandamine, kui agent põhjustas vea
- **Keelatud ilma küsimata:**
  - saladuste käsitlemine (API võtmed, tokenid) väljaspool `.env`/peidetud sisendit
  - `.env` muutmine või väärtuste paljastamine
  - uued sõltuvused (npm install) ilma põhjuseta — **MAX režiimis** lubatud ainult minimaalne/põhjendatud (vt **MAX režiim**)
  - suured refaktorid, “puhastused”, ümberkorraldused
  - portide muutmine (sh 3000)
  - `git push --force`, `rebase`, ajaloo ümberkirjutamine — **MAX režiimis** lubatud `git commit`/`git push` tavalise töövoo raames, kui gate’d läbivad (vt **MAX režiim**)
- **Tööstiil:** 1 samm korraga ainult siis, kui on vaja sinu sisendit; muidu agent tegutseb ja raporteerib tulemuse.

## TÖÖLUBA (ühekordne, püsiv)

Omanik annab agendile loa töötada autonoomselt järgmistes piirides:

### Agent võib teha ise (ilma kinnitust küsimata)

- diagnostika ja logide kontroll
- väiksed, pööratavad koodiparandused (stabiilsus/automaatika)
- dokumentatsiooni täiendused
- `npm run build`, `npm run lint`, `npm run verify:make-layer`, `npm run gate:fast`, `npm run rrr`
- PM2 restart ainult siis, kui koodimuudatus vajab (ja `.env` pole muutunud)

### Agent EI tohi teha ilma eraldi käsuta

- `.env` muutmine või saladuste käsitlemine (sh tokenite kopeerimine chatti)
- portide muutmine (sh 3000)
- suured refaktorid ja “puhastused”
- `git push --force`, `rebase` ja muu ajaloo ümberkirjutamine

## MAX režiim (omanik kinnitas: KINNITAN MAX)

- **Eesmärk:** vähendada hõõrdumist; fookus lõpptulemusel. “Saladuste” reeglid ei ole hinnang projekti “salajasusele”, vaid kaitse **kogemata lekete** ja **katkestuste** vastu.
- **Git:** agent võib teha **`git commit`** ja **`git push`**, kui:
  - projekti hookid/kontrollid (nt pre-commit `gate:fast` ja pre-push `gate:full`) **läbivad**;
  - commit **ei sisalda** `.env` ega teisi ignore’itud saladusi; `.env` jääb `.gitignore` alla;
  - **ei** kasutata `force`, `rebase` ega ajaloo ümberkirjutust.
- **npm install:** lubatud ainult siis, kui see on **minimaalne ja põhjendatud** (nt build/lint/testi parandus), mitte “katsete” või juhuslike pakettide pärast.
- **Saladused:** ikkagi **mitte chatti**; töö käib `.env` / lõikelaua / peidetud sisendiga.

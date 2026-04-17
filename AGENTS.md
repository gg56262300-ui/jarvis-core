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

- **Vastamise keel:** vasta **eesti keeles**. Kui omanik kirjutab teises keeles (nt vene või inglise), see **ei muuda** seda reeglit — juhised, selgitused ja töövastused jäävad **eesti keelde**. Erand ainult siis, kui omanik palub **selgelt** vastata teises keeles.
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
  Üks tegevus = üks samm; järgmine samm ainult pärast eelmise kinnitust või tulemust.
  Saladused (tokenid, võtmed): mitte chatti; ainult .env, terminal (peidetud sisend) või lõikelaud — kuidas täpselt, samuti samm-sammult.
  Kui on kaks asja järjest (nt token + chat id): esmalt kirjelda, kuidas esimene valmis saada, siis teine; või ütle: “tee X valmis, siis alles käivita käsk”.
  Terminalis zsh: ära kasuta bash-stiilis read -s "pikk prompt" muutuja — kasuta zsh-sõbralikku read süntaksit või redaktoris .env käsitsi.
  OAuth / brauser: millises seadmes avada link (127.0.0.1 = sama Mac mis Jarvis).
  Varukoopiad: npm run backup, kuhu fail läheb, et .env zipis eraldi kaasas, 7 päeva puhastus, serverisse ainult krüptitult + scp/rsync mõte.
  Vestluse ajad: Jarvis chat.html näitab nüüd aega; Cursori küljeriba chati kuupäeva ei saa projektifailidega muuta — seal määrab Cursor ise; logide jaoks pm2 logs / logs/.

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

**Ei kuulu vaikimisi tsüklisse (ainult omaniku loal või eraldi ülesandes):** `npm install`, git commit/push, `.env` sisu, portide muutmine, suured refaktorid.

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
  - uued sõltuvused (npm install) ilma põhjuseta
  - suured refaktorid, “puhastused”, ümberkorraldused
  - portide muutmine (sh 3000)
  - git push / force / rebase; commit ainult omaniku käsul
- **Tööstiil:** 1 samm korraga ainult siis, kui on vaja sinu sisendit; muidu agent tegutseb ja raporteerib tulemuse.

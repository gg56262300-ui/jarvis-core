# Jarvis VPS — üks korrasoleku kontroll (Robert / OpenAI)

**Miks „eile töötas, täna mitte“:** telefon räägib **sinu VPS-iga** (`jarvis-kait.us`), mitte Maciga. Kui seal on **vale või puuduv `OPENAI_API_KEY`**, vananenud PM2 käivitus või pole uut koodi paigaldatud, näed Robertis autentimis- või varuvastuse teadet. See ei tähenda, et „iga päev uus võti“ — tähendab, et **see üks server** vajab **üht** sünkrooni.

**Mis repos tehti (ei ole „prügikast“):** käivitus laeb nüüd `.env` enne Node käivitumist; valve kontrollib ka OpenAI-t; võimalik võti failist (`OPENAI_API_KEY_FILE`). See on **vähendab** segadust, ei lisa juhuslikke faile.

---

## Tee seda **ühes järjekorras** (VPS-is, terminal SSH või hostingu terminal)

Asenda `/TEE/JARVIS` oma tegeliku projektikaustaga (nt `~/jarvis-core`).

1. **Logi VPS-i sisse** (sama koht, kus jookseb `pm2` ja `jarvis`).

2. **Mine projekti kausta:**
   ```bash
   cd /TEE/JARVIS
   ```

3. **Tõmba uusim kood:**
   ```bash
   git pull
   ```

4. **Sõltuvused (üks neist):**
   ```bash
   npm ci
   ```
   Kui `npm ci` ei sobi, siis: `npm install`

5. **Ehita:**
   ```bash
   npm run build
   ```

6. **Kontrolli OpenAI võtit (kõige olulisem rida):**
   ```bash
   npm run check:openai-auth
   ```
   - Peab lõppeda tekstiga **`OK: OpenAI autentimine...`**
   - Kui **FAIL** → ava sama kaustas fail **`.env`** (nano, vim, või SFTP/FileZilla), veendu, et **`OPENAI_API_KEY`** on **täpselt sama kehtiv võti** mis töötab Macis. Salvesta.  
     Kui Macis on `OPENAI_ORG_ID` / `OPENAI_PROJECT_ID`, peavad need VPS-is samuti klappima või olema eemaldatud (vale org = 401).

7. **Taaskäivita rakendus (et `.env` tõesti laeks):**
   ```bash
   pm2 restart jarvis --update-env
   ```

8. **Telefonis:** ava Robert, saada **üks lühike sõnum** (mitte ainult `1+1`).  
   - **Korras:** tavaline vastus, **ei** ole teksti „varuvastus“ / „OpenAI võti“ märkust.  
   - **Mitte korras:** korda punkti **6** (võti ja org/projekt).

---

## PM2 erijuht

Kui `jarvis` ei kasuta `npm start`, vaid otse `node …`, sea käsurea argumendid nii, et **Node saaks `.env`**: vt repos **`ecosystem.config.example.cjs`** (rida `args: '--env-file=.env --import ./dist/instrument.js dist/index.js'`).

---

## Pärast seda

- **Autocheck** (kui see jookseb croniga) hoiab nüüd silma peal ka **OpenAI autentimisel** — kui see jälle katkeb, tuleb Telegram/Push **PROBLEM**, mitte vaikus + telefonis šokk.
- Kui kõik ülal on **üks kord** tehtud ja `check:openai-auth` on **OK**, ei pea sa „iga hommikust uut parandust“ otsima — ainult siis, kui **võti või server** tegelikult muutub.

/**
 * Ühtne tekst: Telegrami «Jarvisi projektitöö» ping-pongi eeltingimused.
 * Kasutatakse käsuga `/jarvis` ja `npm run jarvis:telegram-work`.
 */
export function buildTelegramJarvisWorkflowGuide(): string {
  return [
    '=== JARVIS ↔ TELEGRAM (ping-pong) ===',
    '',
    'Telegram võimaldab kahesuunalist vestlust (tekst; hääl jms vastavalt seadistusele). Robert on sama mis veebis — erinevus on ainult kanal.',
    '',
    'KODU ARVUTI KINNI, SERVER 24/7:',
    '• Jarvis (PM2) võib töötada serveris ööpäevaringselt — Telegram + polling/webhook jõuab sinna ka siis, kui Mac on väljas.',
    '• Cursori agendi sammud Macis EI jookse, kui Mac on kinni — need vajavad kohalikku masinat.',
    '• Jälg: `logs/agent-inbox.jsonl` kogub vestluse ridu; Telegramis `/inbox` näitab viimaseid ridu (ilma LLM-ita).',
    '• Arendusjärjekord: sõnum mis algab `Robert` (nt `Robert: lisa test`) → `logs/dev-queue.jsonl` (ilma LLM-ita), Cursor võib hiljem töödelda.',
    '',
    'PEAB OLEMA:',
    '1) PM2 protsess `jarvis` töös; pärast koodimuudatusi: `npm run build` → `pm2 restart jarvis --update-env`.',
    '2) Sissetulev sõnum jõuab Jarvisini — üks variant:',
    '   • TELEGRAM_USE_POLLING=true (getUpdates; ei vaja avalikku URL-i), VÕI',
    '   • JARVIS_WEBHOOK_PUBLIC_BASE + `npm run telegram:set-webhook` (HTTPS tunnel/VPS).',
    '3) .env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (sama privaatvestlus).',
    '4) OPENAI_API_KEY või OPENAI_API_KEY_FILE — muidu küsimustele ei vasta LLM.',
    '5) Kui TELEGRAM_WEBHOOK_SECRET on seatud, peab see ühtima Telegrami setWebhook secret_tokeniga.',
    '',
    'KONTROLL (projekti juur, terminal):',
    '  npm run jarvis:telegram-work',
    '  npm run telegram:webhook-smoke',
    '  curl -sS \'http://127.0.0.1:3000/api/integrations/telegram/status?webhook=1\' | jq',
    '',
    'TELEGRAMIS:',
    '  /ping   — kas sõnum jõuab serverisse (ilma LLM-ita)',
    '  /inbox  — viimased agent-inbox read (serveri «jälg»)',
    '  /jarvis — see juhend',
    '  tavaline lause — Robert + tööriistad (ping-pong)',
    '',
    'Valikulised: TELEGRAM_VOICE_REPLY=true (häälvastus), TELEGRAM_PIN_BOT_REPLY, JARVIS_CHAT_COMPLETION_MODEL.',
    '',
    'Koodisõna (valikuline): TELEGRAM_INBOUND_PREFIX_REQUIRED=true + TELEGRAM_INBOUND_PREFIX=Jarvis — ainult sõnumid stiilis "Jarvis: küsimus" lähevad LLM-i; /ping ja /jarvis ilma eesliiteta. Väljaminev allkiri: TELEGRAM_REPLY_SIGNATURE="▸ Jarvis" — näed, et vastus on serverist.',
    '',
    '---',
    'RU: нужны token + chat_id + (поллинг ИЛИ вебхук) + ключ OpenAI; детали — `AGENTS.md` (раздел Telegram).',
  ].join('\n');
}

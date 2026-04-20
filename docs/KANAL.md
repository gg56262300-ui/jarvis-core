# Jarvisi avalik kanal (kestvus)

## Mis on „kanal“

**Telefon → internet → sinu Mac (port 3000)**. Stabiilsuse annab **Cloudflare’i nimega tunnel** + **PM2** (mitte `trycloudflare.com` ajutine link, mis vahetub).

## Püsiv seadistus (reegel)

1. **PM2:** `jarvis` (Node) ja `cloudflared` mõlemad **online** (`pm2 status`).
2. **Tunnel:** nimega tunnel (nt `jarvis`), DNS kirje (nt `jarvis-kait.us`) Cloudflare’is tunneli külge.
3. **Mac:** ei tohi magada nii, et tunnel katkeb (või kasuta „Power Nap“ / äratus vastavalt vajadusele).

## Üks kontrollkäsk (Macis, projektis)

```bash
chmod +x scripts/jarvis-channel-check.sh
./scripts/jarvis-channel-check.sh
```

Või: `npm run channel:check`

Teise avaliku baas-URL-i jaoks:

```bash
JARVIS_PUBLIC_BASE=https://sinu-domeen.tld ./scripts/jarvis-channel-check.sh
```

## Ametlik tunneli juhend (uuendused Cloudflare’i poolt)

https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/

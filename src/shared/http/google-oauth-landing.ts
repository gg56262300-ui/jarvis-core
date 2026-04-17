import type { Express, Request, Response } from 'express';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Google OAuth tagasisuunamine: kuvab `code` väärtuse, et see saaks kopeerida
 * POST /api/gmail/google/authorize või /api/contacts/google/authorize päringusse.
 */
export function registerGoogleOAuthLanding(app: Express) {
  app.get('/oauth2/google', (request: Request, response: Response) => {
    const code = typeof request.query.code === 'string' ? request.query.code.trim() : '';

    if (!code) {
      response
        .status(400)
        .type('html')
        .send(
          '<!DOCTYPE html><html lang="et"><head><meta charset="utf-8"><title>OAuth</title></head><body><p>Puudub <code>code</code> parameeter.</p></body></html>',
        );
      return;
    }

    const safe = escapeHtml(code);
    response.type('html').send(`<!DOCTYPE html>
<html lang="et">
<head><meta charset="utf-8"><title>Google OAuth</title>
<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;}pre{word-break:break-all;background:#f4f4f4;padding:1rem;}</style>
</head>
<body>
<h1>OAuth kood saadud</h1>
<p>Kopeeri see kood ja saada POST päringuga Jarvisile:</p>
<ul>
<li><code>POST /api/gmail/google/authorize</code> — body <code>{"code":"…"}</code></li>
<li><code>POST /api/contacts/google/authorize</code> — body <code>{"code":"…"}</code></li>
</ul>
<p><strong>code:</strong></p>
<pre id="c">${safe}</pre>
<p>Võid selle akna sulgeda.</p>
</body>
</html>`);
  });
}

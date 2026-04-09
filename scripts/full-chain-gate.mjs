const checks = [
  {
    name: 'health',
    run: async () => {
      const res = await fetch('http://localhost:3000/health');
      const text = await res.text();
      return { ok: res.ok && text.includes('ok'), detail: text.trim() };
    },
  },
  {
    name: 'voice_calendar_today',
    run: async () => {
      const res = await fetch('http://localhost:3000/api/voice/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'mis mul täna kalendris on',
          locale: 'et-EE',
          source: 'text',
        }),
      });
      const json = await res.json();
      const text = [json.responseText ?? '', json.displayText ?? '', json.speechText ?? ''].join('\n');
      const ok =
        !text.includes('Palun ütle lihtne arvutus') &&
        (text.includes('Tänased kalendrisündmused') || text.includes('Täna on sul'));
      return { ok, detail: (json.responseText ?? '').trim() };
    },
  },
  {
    name: 'voice_calendar_next',
    run: async () => {
      const res = await fetch('http://localhost:3000/api/voice/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'mis on minu järgmine kalendrisündmus',
          locale: 'et-EE',
          source: 'text',
        }),
      });
      const json = await res.json();
      const text = [json.responseText ?? '', json.displayText ?? '', json.speechText ?? ''].join('\n');
      const ok =
        !text.includes('Palun ütle lihtne arvutus') &&
        !text.includes('Vastus on') &&
        (
          text.includes('järgmine') ||
          text.includes('kalendrisündmus') ||
          text.includes('Sul ei ole tulevasi sündmusi') ||
          text.includes('Sul ei ole ühtegi tulevast sündmust')
        );
      return { ok, detail: (json.responseText ?? '').trim() };
    },
  },
  {
    name: 'voice_calculator',
    run: async () => {
      const res = await fetch('http://localhost:3000/api/voice/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'arvuta 2 pluss 2',
          locale: 'et-EE',
          source: 'text',
        }),
      });
      const json = await res.json();
      const text = [json.responseText ?? '', json.displayText ?? '', json.speechText ?? ''].join('\n');
      const ok = text.includes('Vastus on');
      return { ok, detail: (json.responseText ?? '').trim() };
    },
  },
  {
    name: 'voice_calendar_create_parse',
    run: async () => {
      const res = await fetch('http://localhost:3000/api/voice/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'lisa kalendrisse homme kell 10 kuni 11 TEST KELL KÜMME',
          locale: 'et-EE',
          source: 'text',
        }),
      });
      const json = await res.json();
      const text = [json.responseText ?? '', json.displayText ?? '', json.speechText ?? ''].join('\n');
      const ok = !text.includes('Cannot read properties of undefined') && !text.includes('Internal Server Error');
      return { ok, detail: (json.responseText ?? '').trim() };
    },
  },
];

let failed = 0;

console.log('===== FULL CHAIN GATE =====');

for (const check of checks) {
  try {
    const result = await check.run();
    if (result.ok) {
      console.log(`PASS ${check.name}`);
    } else {
      failed += 1;
      console.log(`FAIL ${check.name}`);
    }
    console.log(`  ${result.detail}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${check.name}`);
    console.log(`  ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log('');
}

if (failed > 0) {
  console.log(`GATE RESULT: FAIL (${failed} failed)`);
  process.exit(1);
}

console.log('GATE RESULT: PASS');

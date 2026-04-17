const cases = [
  {
    name: 'calendar_today',
    text: 'mis mul täna kalendris on',
    mustInclude: ['Tänased kalendrisündmused'],
    mustNotInclude: ['Palun ütle lihtne arvutus'],
  },
  {
    name: 'calendar_next',
    text: 'mis on minu järgmine kalendrisündmus',
    mustInclude: [],
    mustNotInclude: ['Palun ütle lihtne arvutus'],
  },
  {
    name: 'calculator_simple',
    text: 'arvuta 2 pluss 2',
    mustInclude: [],
    mustNotInclude: ['Palun ütle lihtne arvutus'],
  },
];

async function callVoice(text) {
  const response = await fetch('http://localhost:3000/api/voice/turns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, locale: 'et-EE', source: 'text' }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

let failed = 0;

console.log('===== VOICE REGRESSION GATE =====');

for (const testCase of cases) {
  try {
    const result = await callVoice(testCase.text);
    const combined = [
      result.responseText ?? '',
      result.displayText ?? '',
      result.speechText ?? '',
    ].join('\n');

    const missing = testCase.mustInclude.filter((part) => !combined.includes(part));
    const forbidden = testCase.mustNotInclude.filter((part) => combined.includes(part));

    if (missing.length === 0 && forbidden.length === 0) {
      console.log(`PASS ${testCase.name}`);
      console.log(`  text: ${testCase.text}`);
      console.log(`  response: ${(result.responseText ?? '').trim()}`);
    } else {
      failed += 1;
      console.log(`FAIL ${testCase.name}`);
      console.log(`  text: ${testCase.text}`);
      console.log(`  missing: ${missing.join(' | ') || '-'}`);
      console.log(`  forbidden: ${forbidden.join(' | ') || '-'}`);
      console.log(`  response: ${(result.responseText ?? '').trim()}`);
    }
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${testCase.name}`);
    console.log(`  error: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('');
}

if (failed > 0) {
  console.log(`GATE RESULT: FAIL (${failed} failed)`);
  process.exit(1);
}

console.log('GATE RESULT: PASS');

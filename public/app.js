const forceClearOldCache = async () => {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
      }
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
    }
  } catch {
    // ignore cleanup errors
  }
};

forceClearOldCache();

const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const transcript = document.getElementById('transcript');
const response = document.getElementById('response');
const talkButton = document.getElementById('talk-button');
const stopButton = document.getElementById('stop-button');
const sendTextButton = document.getElementById('send-text-button');
const textInput = document.getElementById('text-input');
const inputModeLabel = document.getElementById('input-mode-label');
const installButton = document.getElementById('install-button');

let deferredInstallPrompt = null;
let recognition = null;
let isListening = false;

const statusLabels = {
  idle: 'Ootel',
  listening: 'Kuulan',
  processing: 'Töötlen',
  speaking: 'Vastan',
};

const setStatus = (status) => {
  statusText.textContent = statusLabels[status] ?? 'Ootel';
  statusDot.className = `status-dot ${status === 'idle' ? '' : status}`.trim();
};

const setTranscript = (text) => {
  transcript.textContent = text || 'Sinu jutt ilmub siia.';
  transcript.classList.toggle('muted', !text);
};

const setResponse = (text) => {
  response.textContent = text || 'Jarvis on valmis.';
};

const findEstonianVoice = () => {
  if (!('speechSynthesis' in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices || !voices.length) {
    return null;
  }

  return (
    voices.find((voice) => (voice.lang || '').toLowerCase() === 'et-ee') ||
    voices.find((voice) => (voice.lang || '').toLowerCase().startsWith('et')) ||
    voices.find((voice) => /eston|eesti/i.test(`${voice.name || ''} ${voice.lang || ''}`)) ||
    null
  );
};

const speakResponse = (text) => {
  if (!('speechSynthesis' in window) || !text) {
    setStatus('idle');
    return;
  }

  window.speechSynthesis.cancel();

  const voice = findEstonianVoice();

  if (!voice) {
    setStatus('idle');
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice.lang || 'et-EE';
  utterance.voice = voice;
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.onend = () => setStatus('idle');
  utterance.onerror = () => setStatus('idle');
  window.speechSynthesis.speak(utterance);
};

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

const sendTurn = async (text, source) => {
  setTranscript(text);
  inputModeLabel.textContent = source === 'speech' ? 'hääl' : 'tekst';
  setStatus('processing');
  setResponse(`SAADAN PRAEGU: ${text}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const request = await fetch('/api/voice/turns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        locale: 'et-EE',
        inputMode: source === 'speech' ? 'speech' : 'text',
        outputMode: 'text',
      }),
    });

    clearTimeout(timeoutId);

    if (!request.ok) {
      let errorText = '';
      try {
        errorText = await request.text();
      } catch {
        errorText = '';
      }
      setResponse(`HTTP VIGA ${request.status}: ${errorText}`.trim());
      setStatus('idle');
      return;
    }

    const result = await request.json();
    const answer =
      result?.displayText ||
      result?.responseText ||
      result?.speechText ||
      'Jarvis ei tagastanud vastust.';

    setResponse(`VASTUS: ${answer}`);
    setStatus('idle');
  } catch (error) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : String(error);
    setResponse(`ÜHENDUSE VIGA: ${message}`);
    setStatus('idle');
  }
};

const createSpeechRecognition = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    return null;
  }

  const nextRecognition = new SpeechRecognition();
  nextRecognition.lang = 'et-EE';
  nextRecognition.interimResults = true;
  nextRecognition.continuous = false;

  nextRecognition.onstart = () => {
    isListening = true;
    setStatus('listening');
  };

  nextRecognition.onresult = (event) => {
    const finalText = Array.from(event.results)
      .map((result) => result[0]?.transcript ?? '')
      .join(' ')
      .trim();

    setTranscript(finalText);
  };

  nextRecognition.onerror = () => {
    isListening = false;
    setStatus('idle');
    setResponse('Brauseri kõnetuvastus ei õnnestunud. Kasuta all olevat tekstivälja.');
  };

  nextRecognition.onend = async () => {
    if (!isListening) {
      setStatus('idle');
      return;
    }

    isListening = false;
    const text = transcript.textContent === 'Sinu jutt ilmub siia.' ? '' : transcript.textContent.trim();

    if (!text) {
      setStatus('idle');
      return;
    }

    await sendTurn(text, 'speech');
  };

  return nextRecognition;
};

const startListening = () => {
  if (!recognition) {
    recognition = createSpeechRecognition();
  }

  if (!recognition) {
    setResponse('Selles brauseris puudub kõnetuvastus. Kasuta tekstivälja.');
    return;
  }

  setTranscript('');
  recognition.start();
};

const stopListening = () => {
  isListening = false;

  if (recognition) {
    recognition.stop();
  }

  window.speechSynthesis?.cancel();
  setStatus('idle');
};

talkButton.addEventListener('pointerdown', () => {
  if (isListening) {
    return;
  }

  isListening = true;
  startListening();
});

talkButton.addEventListener('pointerup', () => {
  if (recognition && isListening) {
    recognition.stop();
  }
});

talkButton.addEventListener('pointercancel', stopListening);
stopButton.addEventListener('click', stopListening);

sendTextButton.addEventListener('click', async () => {
  const text = textInput.value.trim();
  inputModeLabel.textContent = 'tekst';

  if (!text) {
    setResponse('Sisesta kõigepealt tekst, mida Jarvis peaks töötlema.');
    return;
  }

  setResponse('TEKSTINUPP TUVASTATUD');
  await sendTurn(text, 'text');
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) {
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
      }
    } catch {
      // keep silent
    }
  });
}

setStatus('idle');


const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Allowed voice IDs — whitelist to prevent SSRF via voiceId param
const ALLOWED_VOICE_IDS = new Set([
  'bspiLwZDEcpIbBf6zWeq', // Anjura (female)
  'siw1N9V8LmYeEWKyWBxv', // Ruhaan (male)
]);

const ALLOWED_ORIGINS = [
  'https://cult-tts-proxy-production.up.railway.app',
  'http://localhost:3000',
];

app.use(express.json({ limit: '1mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// CORS + origin/referer check
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';

  // Require a valid origin or referer — blocks raw curl/Postman calls
  const allowed = ALLOWED_ORIGINS.some(o => origin === o || referer.startsWith(o));
  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// TTS proxy endpoint
app.post('/api/tts/:voiceId', async (req, res) => {
  const { voiceId } = req.params;

  // Validate voice ID against whitelist
  if (!ALLOWED_VOICE_IDS.has(voiceId)) {
    return res.status(400).json({ error: 'Invalid voice ID' });
  }

  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Sanitize request body — only forward expected fields
  const { text, model_id, voice_settings } = req.body;
  if (!text || typeof text !== 'string' || text.length > 5000) {
    return res.status(400).json({ error: 'Invalid or missing text (max 5000 chars)' });
  }

  const payload = {
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: Number(voice_settings?.stability) || 0.5,
      similarity_boost: Number(voice_settings?.similarity_boost) || 0.75,
      speed: Number(voice_settings?.speed) || 1.0,
    },
  };

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).send(text);
    }

    res.set('Content-Type', 'audio/mpeg');
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach ElevenLabs API' });
  }
});

app.listen(PORT, () => {
  console.log(`Cult TTS proxy running on port ${PORT}`);
});

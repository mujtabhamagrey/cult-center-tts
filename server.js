const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const ALLOWED_ORIGINS = [
  'https://cult-center-tts.up.railway.app',
  'http://localhost:3000',
];

app.use(express.json({ limit: '1mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// CORS + origin check
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const allowed = ALLOWED_ORIGINS.some(o => origin === o || referer.startsWith(o));

  // Allow same-origin requests (no origin header) or matched origins
  if (!origin || allowed) {
    res.set('Access-Control-Allow-Origin', origin || '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }
  res.status(403).json({ error: 'Forbidden' });
});

// TTS proxy endpoint
app.post('/api/tts/:voiceId', async (req, res) => {
  const { voiceId } = req.params;
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify(req.body),
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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import OpenAI from 'openai';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '.env') });

const isProd = process.argv.includes('--prod');
const port = Number(process.env.PORT || 5173);
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const realtimeModel = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;
const app = express();

app.use(express.json({ limit: '14mb' }));

const missionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    codename: { type: 'string' },
    title: { type: 'string' },
    clue: { type: 'string' },
    zone: { type: 'string' },
    proof: { type: 'string' },
    mood: { type: 'string' },
    reward: { type: 'number' },
    x: { type: 'number' },
    y: { type: 'number' },
    companionLine: { type: 'string' },
  },
  required: ['codename', 'title', 'clue', 'zone', 'proof', 'mood', 'reward', 'x', 'y', 'companionLine'],
};

const judgeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    passed: { type: 'boolean' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
    feedback: { type: 'string' },
    points_awarded: { type: 'number' },
  },
  required: ['passed', 'confidence', 'reason', 'feedback', 'points_awarded'],
};

function requireOpenAI(response) {
  if (!openai) {
    response.status(503).json({
      live: false,
      error: 'OPENAI_API_KEY is not configured on the server.',
    });
    return false;
  }

  return true;
}

function parseStructuredJson(response) {
  const text = response.output_text || '';

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error('Model did not return parseable JSON.');
    }

    return JSON.parse(match[0]);
  }
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, numeric));
}

function normalizePercent(value, fallback) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const percent = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;

  return Math.round(clampNumber(percent, 0, 100, fallback));
}

app.get('/api/status', (_request, response) => {
  response.json({
    live: Boolean(openai),
    model,
    realtimeModel,
  });
});

app.get('/api/maps-config', (_request, response) => {
  response.json({
    enabled: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    apiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    mapId: process.env.GOOGLE_MAPS_MAP_ID || '',
  });
});

app.post('/api/mission/next', async (request, response) => {
  if (!requireOpenAI(response)) {
    return;
  }

  try {
    const context = request.body || {};
    const result = await openai.responses.create({
      model,
      input: [
        {
          role: 'system',
          content:
            'You are Agent 1, the live Game Master for Busan AI Quest. Create unpredictable, safe walking missions around Busan. Do not name exact businesses. Do not require purchases. Make missions location-aware, playful, and judgeable by photo plus short answer. Codename must be two short words, 18 characters max. The companionLine must be atmospheric and must not name the exact target object, place, or answer. Return only the requested structured JSON.',
        },
        {
          role: 'user',
          content: `Create the next mission from this game context:\n${JSON.stringify(context, null, 2)}\n\nRules: x and y are UI map coordinates from 18 to 82. The title must be an action mission. The clue must be indirect, not an exact answer. The proof should be one short validation instruction. Codename should fit on a mobile game card.`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'busan_quest_mission',
          strict: true,
          schema: missionSchema,
        },
      },
    });
    const mission = parseStructuredJson(result);

    response.json({
      live: true,
      mission: {
        codename: String(mission.codename || 'City Signal').slice(0, 22),
        title: String(mission.title || 'Find a local Busan detail').slice(0, 96),
        clue: String(mission.clue || 'Look for a detail that feels specific to this area.').slice(0, 180),
        zone: String(mission.zone || 'nearby route').slice(0, 40),
        proof: String(mission.proof || 'Photo plus one short answer.').slice(0, 90),
        mood: String(mission.mood || 'exploration').slice(0, 28),
        reward: clampNumber(mission.reward, 80, 220, 120),
        x: clampNumber(mission.x, 18, 82, 48),
        y: clampNumber(mission.y, 22, 78, 50),
        companionLine: String(mission.companionLine || 'The route changed. I will walk with you, but I will not spoil it.').slice(0, 160),
      },
    });
  } catch (error) {
    response.status(500).json({
      live: false,
      error: error instanceof Error ? error.message : 'Mission generation failed.',
    });
  }
});

app.post('/api/companion/message', async (request, response) => {
  if (!requireOpenAI(response)) {
    return;
  }

  try {
    const context = request.body || {};
    const result = await openai.responses.create({
      model,
      input: [
        {
          role: 'system',
          content:
            'You are Agent 2, the Busan AI Quest walking companion. Speak like a friendly local companion. React to the player, share atmosphere and soft cultural context, but never reveal the answer or exact target. Keep it under 28 words.',
        },
        {
          role: 'user',
          content: JSON.stringify(context),
        },
      ],
    });

    response.json({
      live: true,
      message: (result.output_text || 'I am with you. Watch the small details, not only the bright signs.').trim().slice(0, 180),
    });
  } catch (error) {
    response.status(500).json({
      live: false,
      error: error instanceof Error ? error.message : 'Companion failed.',
    });
  }
});

app.post('/api/mission/judge', async (request, response) => {
  if (!requireOpenAI(response)) {
    return;
  }

  try {
    const { mission, answer, imageDataUrl, routeCount, hintCount } = request.body || {};
    const content = [
      {
        type: 'input_text',
        text:
          `Judge this Busan AI Quest proof.\nMission: ${JSON.stringify(mission)}\n` +
          `Answer: ${answer || ''}\nRoute points: ${routeCount || 0}\nHints used: ${hintCount || 0}\n` +
          'Accept creative valid proof. Reject unrelated, low-effort, or impossible proof. If image is missing, be stricter but still evaluate the answer.',
      },
    ];

    if (typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
      content.push({
        type: 'input_image',
        image_url: imageDataUrl,
      });
    }

    const result = await openai.responses.create({
      model,
      input: [
        {
          role: 'system',
          content:
            'You are Agent 3, the mission Judge for a real-world walking game. Validate using image content, mission intent, answer specificity, route context, and anti-cheat reasoning. Confidence must be a 0-100 percentage number. If passed, points_awarded should usually be 80-220. If rejected, points_awarded must be 0. Return only the structured JSON.',
        },
        {
          role: 'user',
          content,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'busan_quest_judgement',
          strict: true,
          schema: judgeSchema,
        },
      },
    });
    const judgement = parseStructuredJson(result);

    const confidence = normalizePercent(judgement.confidence, 50);
    const passed = Boolean(judgement.passed);
    const rawPoints = clampNumber(judgement.points_awarded, 0, 240, passed ? 100 : 0);

    response.json({
      live: true,
      judgement: {
        passed,
        confidence,
        reason: String(judgement.reason || 'Judged against mission intent.').slice(0, 180),
        feedback: String(judgement.feedback || 'Try a clearer proof if this does not pass.').slice(0, 160),
        points_awarded: passed ? Math.max(80, rawPoints) : 0,
      },
    });
  } catch (error) {
    response.status(500).json({
      live: false,
      error: error instanceof Error ? error.message : 'Judging failed.',
    });
  }
});

app.post('/api/realtime-token', async (_request, response) => {
  if (!apiKey) {
    response.status(503).json({
      live: false,
      error: 'OPENAI_API_KEY is not configured on the server.',
    });
    return;
  }

  try {
    const realtimeResponse = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: realtimeModel,
          instructions:
            'You are the Busan AI Quest walking companion. Be friendly and atmospheric. Never reveal exact mission answers.',
          audio: {
            output: {
              voice: 'marin',
            },
          },
        },
      }),
    });

    const body = await realtimeResponse.json();

    if (!realtimeResponse.ok) {
      response.status(realtimeResponse.status).json(body);
      return;
    }

    response.json(body);
  } catch (error) {
    response.status(500).json({
      live: false,
      error: error instanceof Error ? error.message : 'Realtime token creation failed.',
    });
  }
});

if (isProd) {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  const mode = openai ? `live OpenAI agents on ${model}` : 'simulated frontend agents; no OPENAI_API_KEY';
  console.log(`Busan AI Quest running at http://127.0.0.1:${port} (${mode})`);
});

import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';

initializeApp();

const modelParam = defineString('OPENAI_MODEL', { default: 'gpt-4.1-mini' });
const realtimeModelParam = defineString('OPENAI_REALTIME_MODEL', { default: 'gpt-realtime' });
let cachedApiKey = '';
let cacheExpiresAt = 0;

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

function sendJson(response, status, data) {
  response.status(status).set('Cache-Control', 'no-store').json(data);
}

function readBody(request) {
  if (!request.body) {
    return {};
  }

  if (typeof request.body === 'object') {
    return request.body;
  }

  try {
    return JSON.parse(request.body);
  } catch {
    return {};
  }
}

async function resolveApiKey() {
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  if (cachedApiKey && Date.now() < cacheExpiresAt) {
    return cachedApiKey;
  }

  const snapshot = await getFirestore().doc('config/openai').get();
  const apiKey = snapshot.get('apiKey');

  if (typeof apiKey !== 'string' || !apiKey.startsWith('sk-')) {
    throw new Error('OpenAI key is not configured in Firestore at config/openai.apiKey.');
  }

  cachedApiKey = apiKey;
  cacheExpiresAt = Date.now() + 5 * 60 * 1000;

  return cachedApiKey;
}

async function resolveMapsConfig() {
  if (process.env.GOOGLE_MAPS_API_KEY) {
    return {
      enabled: true,
      apiKey: process.env.GOOGLE_MAPS_API_KEY,
      mapId: process.env.GOOGLE_MAPS_MAP_ID || '',
    };
  }

  const snapshot = await getFirestore().doc('config/googleMaps').get();
  const apiKey = snapshot.get('apiKey');

  return {
    enabled: typeof apiKey === 'string' && apiKey.length > 0,
    apiKey: typeof apiKey === 'string' ? apiKey : '',
    mapId: snapshot.get('mapId') || '',
  };
}

async function client() {
  return new OpenAI({ apiKey: await resolveApiKey() });
}

function model() {
  return modelParam.value() || 'gpt-4.1-mini';
}

function realtimeModel() {
  return realtimeModelParam.value() || 'gpt-realtime';
}

function parseStructuredJson(result) {
  const text = result.output_text || '';

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

async function handleStatus(_request, response) {
  let live = false;

  try {
    await resolveApiKey();
    live = true;
  } catch {
    live = false;
  }

  sendJson(response, 200, {
    live,
    model: model(),
    realtimeModel: realtimeModel(),
  });
}

async function handleMapsConfig(_request, response) {
  const config = await resolveMapsConfig();

  sendJson(response, 200, config);
}

async function handleMissionNext(request, response) {
  const context = readBody(request);
  const openai = await client();
  const result = await openai.responses.create({
    model: model(),
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

  sendJson(response, 200, {
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
}

async function handleCompanionMessage(request, response) {
  const context = readBody(request);
  const openai = await client();
  const result = await openai.responses.create({
    model: model(),
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

  sendJson(response, 200, {
    live: true,
    message: (result.output_text || 'I am with you. Watch the small details, not only the bright signs.').trim().slice(0, 180),
  });
}

async function handleJudge(request, response) {
  const { mission, answer, imageDataUrl, routeCount, hintCount } = readBody(request);
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

  const openai = await client();
  const result = await openai.responses.create({
    model: model(),
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

  sendJson(response, 200, {
    live: true,
    judgement: {
      passed,
      confidence,
      reason: String(judgement.reason || 'Judged against mission intent.').slice(0, 180),
      feedback: String(judgement.feedback || 'Try a clearer proof if this does not pass.').slice(0, 160),
      points_awarded: passed ? Math.max(80, rawPoints) : 0,
    },
  });
}

async function handleRealtimeToken(_request, response) {
  const apiKey = await resolveApiKey();
  const realtimeResponse = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model: realtimeModel(),
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

  sendJson(response, realtimeResponse.ok ? 200 : realtimeResponse.status, body);
}

export const api = onRequest(
  {
    region: 'asia-northeast3',
    cors: true,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request, response) => {
    try {
      const path = request.path.replace(/^\/api/, '') || '/';

      if (request.method === 'OPTIONS') {
        response.status(204).send('');
        return;
      }

      if (request.method === 'GET' && path === '/status') {
        await handleStatus(request, response);
        return;
      }

      if (request.method === 'GET' && path === '/maps-config') {
        await handleMapsConfig(request, response);
        return;
      }

      if (request.method === 'POST' && path === '/mission/next') {
        await handleMissionNext(request, response);
        return;
      }

      if (request.method === 'POST' && path === '/companion/message') {
        await handleCompanionMessage(request, response);
        return;
      }

      if (request.method === 'POST' && path === '/mission/judge') {
        await handleJudge(request, response);
        return;
      }

      if (request.method === 'POST' && path === '/realtime-token') {
        await handleRealtimeToken(request, response);
        return;
      }

      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(response, 500, {
        live: false,
        error: error instanceof Error ? error.message : 'API request failed.',
      });
    }
  },
);

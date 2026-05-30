# Busan AI Quest

Mobile-first prototype for a QR-launched Busan walking game controlled by three agents:

- Game Master: creates and adapts missions from player route signals.
- Companion: reacts during exploration without revealing answers.
- Judge: validates photo proof and a short answer.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Live Agents

Create `.env.local` from `.env.example` and set:

```bash
OPENAI_API_KEY=your_server_side_key
```

The key is read only by `server.mjs`. Do not put it in a `VITE_` variable or any frontend file.

For Firebase demo deployment, the Function reads the key from Firestore instead of Firebase Functions secrets:

```text
collection: config
document: openai
field: apiKey
value: sk-...
```

The included `firestore.rules` denies all browser client access to this document. Cloud Functions read it through Firebase Admin SDK.

## Google Maps And Places

The map screen can use Google Maps JavaScript API and Places Library. Locally, set:

```bash
GOOGLE_MAPS_API_KEY=your_browser_key
GOOGLE_MAPS_MAP_ID=optional_map_id
```

For Firebase demo deployment, create:

```text
collection: config
document: googleMaps
fields:
  apiKey: your_browser_key
  mapId: optional_map_id
```

Restrict the Google Maps browser key in Google Cloud Console to these APIs and websites:

- Maps JavaScript API
- Places API
- `http://localhost:5173/*`
- `https://fly-frog-66c85.web.app/*`

## Current Prototype

- QR-style landing and nickname entry
- GPS request with Jagalchi fallback
- Dynamic mission generation
- Stylized Busan map gameplay
- Live text companion with Realtime token endpoint prepared for voice
- Photo proof submission screen
- Judge confidence scoring
- Three-mission completion screen

## Agent Endpoints

- `POST /api/mission/next`
- `POST /api/companion/message`
- `POST /api/mission/judge`
- `POST /api/realtime-token`

Use OpenAI Responses API for Game Master and Judge logic, and Realtime API for the voice companion.

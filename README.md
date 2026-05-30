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

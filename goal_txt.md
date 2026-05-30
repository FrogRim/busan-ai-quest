# Busan AI Quest Goal

Busan AI Quest is a QR-launched mobile web game for the Codex event. Players open the app at the event, allow location, and receive unpredictable walking missions around Busan, starting with Jagalchi Market.

The game is controlled by three GPT agents:

- Game Master: creates location-aware missions and local discovery cards for quest places, stores, and food spots.
- Companion: talks with the player through hints and conversation without revealing the mission answer.
- Judge: checks the player's uploaded photo and short answer before awarding points.

Core experience:

- QR code opens the live Firebase web app.
- The app checks GPS and starts a Busan-themed mission route.
- Google Maps and Places show nearby quest places, local stores, and food spots with photos and details.
- Players scan, walk, ask hints, submit proof, and complete three missions.
- The game should feel different for every user because missions and agent responses are generated live.

Live app:

https://fly-frog-66c85.web.app/

Current build status:

- Live OpenAI Game Master, Companion text, and Judge endpoints are active.
- Google Maps and Places are active.
- Realtime voice token generation works.
- Full realtime WebRTC voice conversation is still the next implementation step.

import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Camera,
  CheckCircle2,
  Compass,
  Crosshair,
  LocateFixed,
  MapPin,
  MessageCircle,
  Mic,
  Navigation,
  Radar,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Timer,
  Trophy,
  Upload,
  Volume2,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import busanNightMarket from './assets/busan-night-market.png';

type Stage = 'landing' | 'locating' | 'briefing' | 'playing' | 'judging' | 'complete';
type AgentKey = 'master' | 'companion' | 'judge';
type MissionStatus = 'active' | 'passed' | 'failed';
type AgentMode = 'checking' | 'live' | 'simulated';

type RoutePoint = {
  x: number;
  y: number;
};

type Mission = {
  id: number;
  codename: string;
  title: string;
  clue: string;
  zone: string;
  proof: string;
  mood: string;
  reward: number;
  x: number;
  y: number;
  status: MissionStatus;
  confidence?: number;
  judgeNote?: string;
};

type LogEntry = {
  agent: AgentKey;
  text: string;
};

type ApiMission = Omit<Mission, 'id' | 'status' | 'confidence' | 'judgeNote'> & {
  companionLine?: string;
};

type ApiJudgement = {
  passed: boolean;
  confidence: number;
  reason: string;
  feedback: string;
  points_awarded: number;
};

type MissionSeed = Omit<Mission, 'id' | 'status' | 'reward' | 'x' | 'y'> & {
  baseX: number;
  baseY: number;
};

const agentMeta: Record<AgentKey, { name: string; signal: string; Icon: LucideIcon }> = {
  master: { name: 'Game Master', signal: 'writing', Icon: Sparkles },
  companion: { name: 'Companion', signal: 'nearby', Icon: MessageCircle },
  judge: { name: 'Judge', signal: 'standby', Icon: ShieldCheck },
};

const missionSeeds: MissionSeed[] = [
  {
    codename: 'Saltlight Echo',
    title: 'Find a place where the sea becomes dinner',
    clue: 'Look for proof that the market is still connected to the water, not just to signs.',
    zone: 'harbor edge',
    proof: 'Photo plus one sentence about what made it feel local.',
    mood: 'food',
    baseX: 64,
    baseY: 46,
  },
  {
    codename: 'Pocket Memory',
    title: 'Find a Busan memory small enough to carry',
    clue: 'Search for a handmade object, souvenir, or crafted detail that feels tied to the city.',
    zone: 'market lanes',
    proof: 'Photo plus why someone would take it home.',
    mood: 'craft',
    baseX: 36,
    baseY: 58,
  },
  {
    codename: 'Street Compass',
    title: 'Find a sign that could guide a lost traveler',
    clue: 'It may be a direction, a landmark, or a visual clue that only makes sense here.',
    zone: 'crossing route',
    proof: 'Photo plus what the sign helps you understand.',
    mood: 'navigation',
    baseX: 48,
    baseY: 34,
  },
  {
    codename: 'Warm Window',
    title: 'Find a shopfront with a human rhythm',
    clue: 'Ignore the biggest storefront. Look for the place that feels used by people every day.',
    zone: 'inner arcade',
    proof: 'Photo plus the detail that caught your eye.',
    mood: 'local life',
    baseX: 29,
    baseY: 42,
  },
  {
    codename: 'Blue Proof',
    title: 'Find the color of Busan hiding in plain sight',
    clue: 'It could be ocean paint, fishing gear, tile, light, or a reflection.',
    zone: 'sea lane',
    proof: 'Photo plus the object or surface where you found it.',
    mood: 'visual',
    baseX: 72,
    baseY: 62,
  },
  {
    codename: 'Local Pulse',
    title: 'Find a place that sounds busier than it looks',
    clue: 'Stand still for a moment and follow motion, voices, tools, water, or cooking.',
    zone: 'sound pocket',
    proof: 'Photo plus what sound led you there.',
    mood: 'senses',
    baseX: 41,
    baseY: 72,
  },
];

const companionLines = [
  'I will keep the clue warm, but I will not spoil the answer.',
  'The best signal here is usually in the small details.',
  'Try moving like a local, not like a tourist chasing a pin.',
  'If the street feels too obvious, turn your attention to the edges.',
  'The Game Master is watching your route and changing the next move.',
];

const walkSignals = ['harbor', 'market', 'arcade', 'crossing', 'alley', 'food smoke'];

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function generateMission(seed: number, step: number, signal: string): Mission {
  const signalWeight = signal.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const index = (seed + step * 5 + signalWeight) % missionSeeds.length;
  const source = missionSeeds[index];
  const driftX = ((seed + step * 11) % 15) - 7;
  const driftY = ((seed + step * 13) % 17) - 8;

  return {
    ...source,
    id: step + 1,
    reward: 120 + step * 35,
    x: clamp(source.baseX + driftX, 18, 82),
    y: clamp(source.baseY + driftY, 22, 78),
    status: 'active',
  };
}

function firstLog(mission: Mission): LogEntry[] {
  return [
    {
      agent: 'master',
      text: `Mission ${mission.id} generated: ${mission.codename}.`,
    },
    {
      agent: 'companion',
      text: 'I am walking beside you. I can talk, tease, and hint, but I cannot reveal the target.',
    },
    {
      agent: 'judge',
      text: 'Submit a real-world photo and a short answer when you think the clue is solved.',
    },
  ];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function mergeMission(fallback: Mission, input?: Partial<ApiMission>): Mission {
  if (!input) {
    return fallback;
  }

  return {
    ...fallback,
    codename: input.codename || fallback.codename,
    title: input.title || fallback.title,
    clue: input.clue || fallback.clue,
    zone: input.zone || fallback.zone,
    proof: input.proof || fallback.proof,
    mood: input.mood || fallback.mood,
    reward: Number.isFinite(input.reward) ? Number(input.reward) : fallback.reward,
    x: Number.isFinite(input.x) ? clamp(Number(input.x), 18, 82) : fallback.x,
    y: Number.isFinite(input.y) ? clamp(Number(input.y), 22, 78) : fallback.y,
  };
}

async function imageAssetToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image asset.'));
    reader.readAsDataURL(blob);
  });
}

function App() {
  const [stage, setStage] = useState<Stage>('landing');
  const [nickname, setNickname] = useState('');
  const [sessionName, setSessionName] = useState('Explorer');
  const [seed, setSeed] = useState(418);
  const [area, setArea] = useState('Jagalchi Market');
  const [locationMode, setLocationMode] = useState('pending');
  const [mission, setMission] = useState<Mission>(() => generateMission(418, 0, 'arrival'));
  const [completed, setCompleted] = useState<Mission[]>([]);
  const [route, setRoute] = useState<RoutePoint[]>([{ x: 52, y: 68 }]);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(30 * 60);
  const [hintCount, setHintCount] = useState(0);
  const [voiceOn, setVoiceOn] = useState(false);
  const [answer, setAnswer] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>(() => firstLog(generateMission(418, 0, 'arrival')));
  const [agentMode, setAgentMode] = useState<AgentMode>('checking');
  const [agentModel, setAgentModel] = useState('local');

  const playerPoint = route[route.length - 1];
  const missionProgress = completed.length + (mission.status === 'passed' ? 1 : 0);

  const companionText = useMemo(() => {
    const line = companionLines[(route.length + hintCount + mission.id) % companionLines.length];
    return voiceOn ? `${line} Voice bridge is armed.` : line;
  }, [hintCount, mission.id, route.length, voiceOn]);

  useEffect(() => {
    if (stage !== 'playing') {
      return;
    }

    const interval = window.setInterval(() => {
      setTimer((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/status')
      .then((response) => response.json())
      .then((status: { live?: boolean; model?: string }) => {
        if (cancelled) {
          return;
        }

        setAgentMode(status.live ? 'live' : 'simulated');
        setAgentModel(status.model || 'local');
      })
      .catch(() => {
        if (!cancelled) {
          setAgentMode('simulated');
          setAgentModel('local');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function requestLiveMission(
    fallback: Mission,
    step: number,
    context: Record<string, unknown>,
    usedCodenames: string[] = [],
  ) {
    if (agentMode !== 'live') {
      return { mission: fallback, companionLine: '' };
    }

    try {
      const data = await postJson<{ live: boolean; mission: ApiMission }>('/api/mission/next', {
        area,
        step,
        usedCodenames,
        currentMission: mission,
        completed,
        route,
        score,
        hintCount,
        ...context,
      });
      const liveMission = mergeMission(fallback, data.mission);

      return {
        mission: liveMission,
        companionLine: data.mission.companionLine || '',
      };
    } catch {
      setAgentMode('simulated');
      return { mission: fallback, companionLine: '' };
    }
  }

  async function bootSession(nextArea = 'Jagalchi Market', mode = 'demo route') {
    const nextSeed = Math.floor(Math.random() * 8000) + Date.now() % 997;
    const firstMission = generateMission(nextSeed, 0, mode);
    const cleanName = nickname.trim() || 'Explorer';

    setSessionName(cleanName);
    setSeed(nextSeed);
    setArea(nextArea);
    setMission(firstMission);
    setCompleted([]);
    setScore(0);
    setTimer(30 * 60);
    setHintCount(0);
    setRoute([{ x: 52, y: 68 }]);
    setAnswer('');
    setPhotoPreview('');
    setLogs(firstLog(firstMission));
    setStage('briefing');

    const live = await requestLiveMission(firstMission, 0, {
      area: nextArea,
      locationMode: mode,
      playerName: cleanName,
      event: 'Codex Busan demo',
    });

    if (live.mission.codename !== firstMission.codename || live.companionLine) {
      setMission(live.mission);
      setLogs([
        { agent: 'master', text: `Live mission generated: ${live.mission.codename}.` },
        {
          agent: 'companion',
          text: live.companionLine || 'The live companion is tracking your route without revealing the target.',
        },
        { agent: 'judge', text: 'Live Judge is ready for photo and answer validation.' },
      ]);
    }
  }

  function startLocationCheck() {
    setStage('locating');
    setLocationMode('requesting GPS');

    if (!navigator.geolocation) {
      setLocationMode('GPS unavailable');
      bootSession('Jagalchi Market', 'manual fallback');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationMode('GPS lock');
        bootSession('Jagalchi Market', 'live GPS lock');
      },
      () => {
        setLocationMode('GPS fallback');
        bootSession('Jagalchi Market', 'permission fallback');
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 },
    );
  }

  async function requestCompanionLine(action: string, fallback: string) {
    if (agentMode !== 'live') {
      return fallback;
    }

    try {
      const data = await postJson<{ live: boolean; message: string }>('/api/companion/message', {
        action,
        area,
        mission,
        completedCount: completed.length,
        routeCount: route.length,
        score,
        hintCount,
      });

      return data.message || fallback;
    } catch {
      return fallback;
    }
  }

  async function walkRoute() {
    const signal = walkSignals[(route.length + mission.id + seed) % walkSignals.length];
    const nextPoint = {
      x: clamp(playerPoint.x + ((seed + route.length * 9) % 17) - 8, 14, 86),
      y: clamp(playerPoint.y + ((seed + route.length * 7) % 15) - 7, 18, 82),
    };
    const fallback = `I noticed your route bending toward ${signal}. The next agent decision will remember that.`;

    setRoute((current) => [...current, nextPoint]);
    setLogs((current) => [
      ...current.slice(-5),
      {
        agent: 'companion',
        text: fallback,
      },
    ]);

    const liveLine = await requestCompanionLine(`player scanned area near ${signal}`, fallback);

    if (liveLine !== fallback) {
      setLogs((current) => [...current.slice(-5), { agent: 'companion', text: liveLine }]);
    }
  }

  async function askHint() {
    const fallback = `Soft hint: follow the ${mission.mood} feeling around the ${mission.zone}. I still will not name the answer.`;

    setHintCount((current) => current + 1);
    setScore((current) => Math.max(0, current - 10));
    setLogs((current) => [
      ...current.slice(-5),
      {
        agent: 'companion',
        text: fallback,
      },
    ]);

    const liveLine = await requestCompanionLine('player asked for a soft hint', fallback);

    if (liveLine !== fallback) {
      setLogs((current) => [...current.slice(-5), { agent: 'companion', text: liveLine }]);
    }
  }

  async function toggleVoiceBridge() {
    const enabling = !voiceOn;

    setVoiceOn(enabling);

    if (!enabling || agentMode !== 'live') {
      return;
    }

    try {
      await postJson('/api/realtime-token', {});
      setLogs((current) => [
        ...current.slice(-5),
        { agent: 'companion', text: 'Realtime companion token is ready. WebRTC audio connection is the next build step.' },
      ]);
    } catch {
      setLogs((current) => [
        ...current.slice(-5),
        { agent: 'companion', text: 'Voice token failed, but live text companion is still available.' },
      ]);
    }
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function useDemoProof() {
    const dataUrl = await imageAssetToDataUrl(busanNightMarket);

    setPhotoPreview(dataUrl);
    setAnswer((current) => current || 'I found a warm market detail connected to local food and the harbor.');
  }

  async function judgeSubmission() {
    let liveJudgement: ApiJudgement | null = null;

    if (agentMode === 'live') {
      try {
        const data = await postJson<{ live: boolean; judgement: ApiJudgement }>('/api/mission/judge', {
          mission,
          answer,
          imageDataUrl: photoPreview,
          routeCount: route.length,
          hintCount,
        });
        liveJudgement = data.judgement;
      } catch {
        liveJudgement = null;
      }
    }

    const answerScore = Math.min(42, answer.trim().length * 2);
    const photoScore = photoPreview ? 44 : 0;
    const routeScore = Math.min(14, route.length * 3);
    const confidence = liveJudgement?.confidence ?? Math.min(96, photoScore + answerScore + routeScore);
    const passed = liveJudgement?.passed ?? confidence >= 58;
    const judgedMission: Mission = {
      ...mission,
      status: passed ? 'passed' : 'failed',
      confidence,
      judgeNote:
        liveJudgement?.feedback ||
        (passed
          ? 'Proof accepted. The answer connects the image to the active clue.'
          : 'Proof is too thin. Add a clearer photo or a more specific answer.'),
    };

    if (!passed) {
      setMission(judgedMission);
      setLogs((current) => [
        ...current.slice(-5),
        {
          agent: 'judge',
          text: liveJudgement
            ? `Live Judge rejected at ${confidence}%: ${liveJudgement.feedback}`
            : `Rejected at ${confidence}% confidence. The Judge wants stronger proof.`,
        },
      ]);
      setStage('playing');
      return;
    }

    const nextCompleted = [...completed, judgedMission];
    const earned = liveJudgement?.points_awarded ?? mission.reward + Math.max(0, 20 - hintCount * 5);

    setCompleted(nextCompleted);
    setScore((current) => current + earned);
    setLogs((current) => [
      ...current.slice(-4),
      {
        agent: 'judge',
        text: liveJudgement
          ? `Live Judge accepted at ${confidence}%: ${liveJudgement.feedback}`
          : `Accepted at ${confidence}% confidence. ${earned} points awarded.`,
      },
    ]);
    setAnswer('');
    setPhotoPreview('');

    if (nextCompleted.length >= 3) {
      setMission(judgedMission);
      setStage('complete');
      return;
    }

    const nextSignal = `${answer} ${route.length} ${confidence}`;
    const usedCodenames = new Set(nextCompleted.map((item) => item.codename));
    let nextMission = generateMission(seed, nextCompleted.length, nextSignal);

    for (let attempt = 1; attempt < missionSeeds.length && usedCodenames.has(nextMission.codename); attempt += 1) {
      nextMission = generateMission(seed + attempt * 19, nextCompleted.length, `${nextSignal} ${attempt}`);
    }

    const liveNext = await requestLiveMission(
      nextMission,
      nextCompleted.length,
      {
        area,
        previousAnswer: answer,
        judgeConfidence: confidence,
        completed: nextCompleted,
        route,
        score: score + earned,
        strategy: 'Adapt the next mission to the accepted proof and avoid repeated mission codenames.',
      },
      Array.from(usedCodenames),
    );
    nextMission = usedCodenames.has(liveNext.mission.codename) ? nextMission : liveNext.mission;

    setMission(nextMission);
    setRoute((current) => [...current, { x: nextMission.x - 7, y: nextMission.y + 8 }]);
    setLogs((current) => [
      ...current.slice(-4),
      {
        agent: 'master',
        text:
          agentMode === 'live'
            ? `Live Game Master adapted mission ${nextMission.id}: ${nextMission.codename}.`
            : `Route adapted. Mission ${nextMission.id} is now ${nextMission.codename}.`,
      },
      { agent: 'companion', text: liveNext.companionLine || 'The story changed because of what you proved.' },
    ]);
    setStage('playing');
  }

  function restart() {
    const nextMission = generateMission(seed + 23, 0, 'restart');
    setStage('landing');
    setMission(nextMission);
    setCompleted([]);
    setRoute([{ x: 52, y: 68 }]);
    setScore(0);
    setTimer(30 * 60);
    setHintCount(0);
    setVoiceOn(false);
    setAnswer('');
    setPhotoPreview('');
    setLogs(firstLog(nextMission));
  }

  return (
    <main className="app">
      {stage === 'landing' && (
        <LandingScreen
          nickname={nickname}
          agentMode={agentMode}
          agentModel={agentModel}
          onNickname={setNickname}
          onStart={startLocationCheck}
        />
      )}

      {stage === 'locating' && (
        <LocatingScreen locationMode={locationMode} onFallback={() => bootSession('Jagalchi Market', 'manual route')} />
      )}

      {stage === 'briefing' && (
        <BriefingScreen
          area={area}
          mission={mission}
          sessionName={sessionName}
          agentMode={agentMode}
          onBegin={() => setStage('playing')}
        />
      )}

      {stage === 'playing' && (
        <GameScreen
          area={area}
          mission={mission}
          completed={completed}
          route={route}
          playerPoint={playerPoint}
          score={score}
          timer={timer}
          hintCount={hintCount}
          agentMode={agentMode}
          voiceOn={voiceOn}
          companionText={companionText}
          logs={logs}
          progress={missionProgress}
          onWalk={walkRoute}
          onHint={askHint}
          onVoice={toggleVoiceBridge}
          onSubmit={() => setStage('judging')}
        />
      )}

      {stage === 'judging' && (
        <JudgingScreen
          mission={mission}
          answer={answer}
          photoPreview={photoPreview}
          onAnswer={setAnswer}
          onPhoto={handlePhoto}
          onDemoProof={useDemoProof}
          onJudge={judgeSubmission}
          onBack={() => setStage('playing')}
        />
      )}

      {stage === 'complete' && (
        <CompleteScreen
          area={area}
          score={score}
          completed={completed}
          timer={timer}
          sessionName={sessionName}
          onRestart={restart}
        />
      )}
    </main>
  );
}

type LandingScreenProps = {
  nickname: string;
  agentMode: AgentMode;
  agentModel: string;
  onNickname: (value: string) => void;
  onStart: () => void;
};

function LandingScreen({ nickname, agentMode, agentModel, onNickname, onStart }: LandingScreenProps) {
  return (
    <section className="screen landing">
      <img className="landing-bg" src={busanNightMarket} alt="" />
      <div className="hud-top">
        <span className="brand-mark">
          <Radar size={18} />
          Busan AI Quest
        </span>
        <span className="qr-chip" title={agentModel}>
          {agentMode === 'live' ? 'Live agents' : agentMode === 'checking' ? 'Checking' : 'Sim demo'}
        </span>
      </div>

      <div className="landing-panel">
        <div className="agent-stack" aria-label="Three agent status">
          <AgentBadge agent="master" detail={agentMode === 'live' ? 'live' : 'ready'} />
          <AgentBadge agent="companion" detail={agentMode === 'live' ? 'live' : 'muted'} />
          <AgentBadge agent="judge" detail={agentMode === 'live' ? 'live' : 'locked'} />
        </div>
        <h1>Busan AI Quest</h1>
        <label className="field-label" htmlFor="nickname">
          Player
        </label>
        <div className="input-row">
          <input
            id="nickname"
            value={nickname}
            onChange={(event) => onNickname(event.target.value)}
            maxLength={18}
            placeholder="Nickname"
          />
          <button className="primary-button" type="button" onClick={onStart}>
            <LocateFixed size={18} />
            Start
          </button>
        </div>
      </div>
    </section>
  );
}

function LocatingScreen({ locationMode, onFallback }: { locationMode: string; onFallback: () => void }) {
  return (
    <section className="screen locating-screen">
      <div className="radar-disc">
        <Crosshair size={42} />
        <span />
      </div>
      <h1>Reading City Signal</h1>
      <p>{locationMode}</p>
      <button className="ghost-button" type="button" onClick={onFallback}>
        <Navigation size={18} />
        Use Jagalchi Route
      </button>
    </section>
  );
}

function BriefingScreen({
  area,
  mission,
  sessionName,
  agentMode,
  onBegin,
}: {
  area: string;
  mission: Mission;
  sessionName: string;
  agentMode: AgentMode;
  onBegin: () => void;
}) {
  return (
    <section className="screen briefing">
      <div className="hud-top">
        <span className="brand-mark">
          <MapPin size={18} />
          {area}
        </span>
        <span className="qr-chip">{agentMode === 'live' ? 'Live quest' : `Player ${sessionName}`}</span>
      </div>
      <AgentBadge agent="master" detail={agentMode === 'live' ? 'live' : 'generating'} />
      <div className="mission-reveal">
        <span className="mission-kicker">Mission 1/3</span>
        <h1>{mission.codename}</h1>
        <h2>{mission.title}</h2>
        <p>{mission.clue}</p>
        <div className="briefing-grid">
          <span>{mission.zone}</span>
          <span>{mission.reward} pts</span>
          <span>{mission.mood}</span>
        </div>
      </div>
      <button className="primary-button wide" type="button" onClick={onBegin}>
        <Zap size={18} />
        Enter Map
      </button>
    </section>
  );
}

type GameScreenProps = {
  area: string;
  mission: Mission;
  completed: Mission[];
  route: RoutePoint[];
  playerPoint: RoutePoint;
  score: number;
  timer: number;
  hintCount: number;
  agentMode: AgentMode;
  voiceOn: boolean;
  companionText: string;
  logs: LogEntry[];
  progress: number;
  onWalk: () => void;
  onHint: () => void;
  onVoice: () => void;
  onSubmit: () => void;
};

function GameScreen({
  area,
  mission,
  completed,
  route,
  playerPoint,
  score,
  timer,
  hintCount,
  agentMode,
  voiceOn,
  companionText,
  logs,
  progress,
  onWalk,
  onHint,
  onVoice,
  onSubmit,
}: GameScreenProps) {
  return (
    <section className="screen game-screen">
      <div className="game-topbar">
        <div>
          <span className="tiny-label">Mission {Math.min(progress + 1, 3)}/3</span>
          <strong>{area}</strong>
        </div>
        <div className="stat-pill">
          <Timer size={16} />
          {formatTime(timer)}
        </div>
        <div className="stat-pill">
          <Trophy size={16} />
          {score}
        </div>
      </div>

      <div className="agent-strip">
        <AgentBadge agent="master" detail={agentMode === 'live' ? 'live' : 'adapting'} />
        <AgentBadge agent="companion" detail={voiceOn ? 'voice' : agentMode === 'live' ? 'live text' : 'text'} />
        <AgentBadge agent="judge" detail={agentMode === 'live' ? 'live' : 'waiting'} />
      </div>

      <div className="map-stage" aria-label="Stylized Busan mission map">
        <div className="sea-zone" />
        <div className="street street-a" />
        <div className="street street-b" />
        <div className="street street-c" />
        <div className="street street-d" />
        <div className="harbor-label">Harbor</div>
        <div className="map-label market-label">Market Lanes</div>
        <div className="map-label arcade-label">Arcade</div>

        {route.map((point, index) => (
          <span
            className="route-dot"
            key={`${point.x}-${point.y}-${index}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          />
        ))}

        <div className="mission-zone" style={{ left: `${mission.x}%`, top: `${mission.y}%` }}>
          <ScanLine size={24} />
        </div>
        <div className="player-pin" style={{ left: `${playerPoint.x}%`, top: `${playerPoint.y}%` }}>
          <Navigation size={18} />
        </div>
      </div>

      <div className="mission-sheet">
        <div className="mission-header">
          <span>{mission.codename}</span>
          <span>{mission.reward} pts</span>
        </div>
        <h1>{mission.title}</h1>
        <p>{mission.clue}</p>
        <div className="mission-proof">
          <Camera size={16} />
          {mission.proof}
        </div>
        {mission.status === 'failed' && mission.judgeNote && (
          <div className="judge-warning">
            <XCircle size={16} />
            {mission.judgeNote}
          </div>
        )}
      </div>

      <div className="action-dock">
        <button className="icon-button" type="button" onClick={onWalk} title="Scan area" aria-label="Scan area">
          <Compass size={20} />
          <span>Scan</span>
        </button>
        <button className="icon-button" type="button" onClick={onVoice} title="Voice companion" aria-label="Voice companion">
          <Mic size={20} />
          <span>{voiceOn ? 'Live' : 'Voice'}</span>
        </button>
        <button className="icon-button" type="button" onClick={onHint} title="Hint" aria-label="Hint">
          <Sparkles size={20} />
          <span>Hint</span>
        </button>
        <button className="icon-button submit-action" type="button" onClick={onSubmit} title="Submit proof" aria-label="Submit proof">
          <Camera size={20} />
          <span>Proof</span>
        </button>
      </div>

      <div className="companion-panel">
        <div className="companion-head">
          <span>
            <Volume2 size={16} />
            Companion
          </span>
          <span>{hintCount} hints</span>
        </div>
        <p>{companionText}</p>
      </div>

      <div className="agent-log">
        {logs.slice(-3).map((entry, index) => (
          <div key={`${entry.agent}-${index}`}>
            <strong>{agentMeta[entry.agent].name}</strong>
            <span>{entry.text}</span>
          </div>
        ))}
      </div>

      <div className="completed-rail">
        {[0, 1, 2].map((index) => (
          <span key={index} className={completed[index] ? 'done' : ''} />
        ))}
      </div>
    </section>
  );
}

type JudgingScreenProps = {
  mission: Mission;
  answer: string;
  photoPreview: string;
  onAnswer: (value: string) => void;
  onPhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  onDemoProof: () => void;
  onJudge: () => void;
  onBack: () => void;
};

function JudgingScreen({
  mission,
  answer,
  photoPreview,
  onAnswer,
  onPhoto,
  onDemoProof,
  onJudge,
  onBack,
}: JudgingScreenProps) {
  return (
    <section className="screen judging-screen">
      <div className="hud-top">
        <button className="plain-button" type="button" onClick={onBack}>
          <Navigation size={17} />
          Map
        </button>
        <AgentBadge agent="judge" detail="active" />
      </div>

      <div className="judge-card">
        <span className="mission-kicker">Judge Review</span>
        <h1>{mission.codename}</h1>
        <div className="photo-drop">
          {photoPreview ? (
            <img src={photoPreview} alt="Mission proof preview" />
          ) : (
            <div>
              <Upload size={34} />
              <span>Proof Photo</span>
            </div>
          )}
        </div>
        <div className="judge-actions">
          <label className="ghost-button file-control">
            <Camera size={18} />
            Upload
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} />
          </label>
          <button className="ghost-button" type="button" onClick={onDemoProof}>
            <ScanLine size={18} />
            Demo Proof
          </button>
        </div>
        <label className="field-label" htmlFor="answer">
          Answer
        </label>
        <textarea
          id="answer"
          value={answer}
          onChange={(event) => onAnswer(event.target.value)}
          rows={4}
          placeholder="What did you find?"
        />
        <button className="primary-button wide" type="button" onClick={onJudge}>
          <ShieldCheck size={18} />
          Submit to Judge
        </button>
      </div>
    </section>
  );
}

function CompleteScreen({
  area,
  score,
  completed,
  timer,
  sessionName,
  onRestart,
}: {
  area: string;
  score: number;
  completed: Mission[];
  timer: number;
  sessionName: string;
  onRestart: () => void;
}) {
  return (
    <section className="screen complete-screen">
      <div className="completion-medal">
        <CheckCircle2 size={52} />
      </div>
      <span className="mission-kicker">{area}</span>
      <h1>{sessionName} cleared the route</h1>
      <div className="score-plate">
        <span>Final Score</span>
        <strong>{score}</strong>
        <small>{formatTime(timer)} left</small>
      </div>
      <div className="completion-list">
        {completed.map((item) => (
          <div key={item.id}>
            <CheckCircle2 size={18} />
            <span>{item.codename}</span>
            <strong>{item.confidence}%</strong>
          </div>
        ))}
      </div>
      <button className="primary-button wide" type="button" onClick={onRestart}>
        <RotateCcw size={18} />
        New Quest
      </button>
    </section>
  );
}

function AgentBadge({ agent, detail }: { agent: AgentKey; detail: string }) {
  const meta = agentMeta[agent];
  const Icon = meta.Icon;

  return (
    <span className={`agent-badge agent-${agent}`}>
      <Icon size={16} />
      <span>{meta.name}</span>
      <em>{detail}</em>
    </span>
  );
}

export default App;

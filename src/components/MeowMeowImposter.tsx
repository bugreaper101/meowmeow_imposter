import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight, Check, CircleHelp, Copy, Crown, Info, LoaderCircle, Lock, Mic,
  Pencil, Search, Send, Settings2, Share2, Sparkles, Timer, Trophy, Users, Vote, Wifi,
} from "lucide-react";
import {
  avatarCatalog, tips,
  roundOptions, imposterOptions, clueOptions, discussionOptions, type MeowAvatar,
} from "./meow/data";
import {
  Badge, Bean, Button, Dialog, Segmented, Skeleton, SlideConfirm, Sky, SliderCard,
  Toast, Top, TimerRing, VoiceControls,
} from "./meow/ui";
import { beanFor, catalogEntry } from "@/game/avatars";
import { actions, clearError, connect, disconnect } from "@/game/client";
import { useGame } from "@/game/store";
import { loadPrefs, savePrefs } from "@/game/prefs";
import { CLUE_SECONDS, DISCUSSION_SECONDS, indexOfSeconds, type PublicPlayer, type RoomState } from "@/game/protocol";
import { useCountdown } from "@/game/useCountdown";
import { setMicEnabled, setSpeakerEnabled, startVoice, stopVoice, syncPeers } from "@/game/voice";

type Stage = "Splash" | "Welcome" | "Create Room" | "Join Room" | "Avatar" | "Host Settings" | "About";

const CODE_LENGTH = 5;

export default function MeowMeowImposter() {
  const { room, self, playerId, status, lastError, peers } = useGame();
  const [stage, setStage] = useState<Stage>("Splash");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [avatar, setAvatar] = useState<string>(avatarCatalog[0]!.name);
  const [tab, setTab] = useState<"Boy" | "Girl" | "Creature">("Boy");
  const [search, setSearch] = useState("");
  const [writerText, setWriterText] = useState("");
  const [rounds, setRounds] = useState(10);
  const [writerMode, setWriterMode] = useState(0);
  const [imposters, setImposters] = useState(0);
  const [clueTime, setClueTime] = useState(3);
  const [discussionTime, setDiscussionTime] = useState(4);
  const [confirmed, setConfirmed] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "leave" | "full" | "lost" | "notFound">(null);
  const [toast, setToast] = useState("");

  // Preferences are the only thing that survives a reload.
  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs.nickname) setNickname(prefs.nickname);
    if (prefs.avatar) setAvatar(prefs.avatar);
    setMicOn(prefs.micEnabled);
    setSpeakerOn(prefs.speakerEnabled);
    void connect();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!lastError) return;
    if (lastError.code === "room_full") setDialog("full");
    else if (lastError.code === "room_not_found") setDialog("notFound");
    else setToast(lastError.message);
    clearError();
  }, [lastError]);

  useEffect(() => {
    setDialog((current) => (status === "reconnecting" ? "lost" : current === "lost" ? null : current));
  }, [status]);

  // ---- voice mesh lifecycle ----
  const voiceReady = useRef(false);
  useEffect(() => {
    if (!room || !playerId) return;
    let cancelled = false;
    void startVoice(playerId).then((ok) => {
      if (cancelled) return;
      voiceReady.current = ok;
      if (!ok) setToast("Microphone blocked — voice is off");
      else {
        setMicEnabled(micOn);
        setSpeakerEnabled(speakerOn);
        syncPeers(peers);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code, playerId]);

  useEffect(() => {
    if (voiceReady.current) syncPeers(peers);
  }, [peers]);

  useEffect(() => {
    if (!room) stopVoice();
  }, [room]);

  useEffect(() => () => stopVoice(), []);

  const toggleMic = (next: boolean) => {
    setMicOn(next);
    setMicEnabled(next);
    savePrefs({ micEnabled: next });
    if (room) actions.voiceState(next, speakerOn);
  };
  const toggleSpeaker = (next: boolean) => {
    setSpeakerOn(next);
    setSpeakerEnabled(next);
    savePrefs({ speakerEnabled: next });
    if (room) actions.voiceState(micOn, next);
  };

  const settings = useMemo(
    () => ({
      rounds,
      imposters: imposters + 1,
      clueSeconds: CLUE_SECONDS[clueTime] ?? 45,
      discussionSeconds: DISCUSSION_SECONDS[discussionTime] ?? 180,
      writerMode: writerMode === 1 ? ("random" as const) : ("sequential" as const),
    }),
    [rounds, imposters, clueTime, discussionTime, writerMode],
  );

  // Host settings mirror the server once a room exists.
  useEffect(() => {
    if (!room) return;
    setRounds(room.settings.rounds);
    setImposters(room.settings.imposters - 1);
    setClueTime(indexOfSeconds(CLUE_SECONDS, room.settings.clueSeconds));
    setDiscussionTime(indexOfSeconds(DISCUSSION_SECONDS, room.settings.discussionSeconds));
    setWriterMode(room.settings.writerMode === "random" ? 1 : 0);
  }, [room?.settings]);

  useEffect(() => {
    if (room?.phase !== "voting" && room?.phase !== "discussion") setSelectedVote(null);
  }, [room?.phase, room?.round]);

  useEffect(() => {
    if (room?.phase === "writer") setWriterText("");
  }, [room?.phase, room?.round]);

  const screen = room ? screenForPhase(room, self?.isWriter ?? false) : stage;
  const inGame = Boolean(room) && room!.phase !== "lobby";

  const commitProfile = () => savePrefs({ nickname: nickname.trim(), avatar });

  const createRoom = () => {
    commitProfile();
    actions.createRoom(nickname.trim(), avatar, settings);
  };
  const joinRoom = () => {
    commitProfile();
    actions.joinRoom(code.join(""), nickname.trim(), avatar);
  };

  const leaveRoom = useCallback(() => {
    actions.leaveRoom();
    stopVoice();
    disconnect();
    void connect();
    setStage("Welcome");
    setConfirmed(false);
  }, []);

  const back = () => {
    if (room) {
      setDialog("leave");
      return;
    }
    if (stage === "Host Settings") setStage("Avatar");
    else if (stage === "Avatar") setStage(mode === "create" ? "Create Room" : "Join Room");
    else setStage("Welcome");
  };

  const p: Shared = {
    room, self, playerId, status, screen,
    go: setStage, back, setMode,
    nickname, setNickname, code, setCode, avatar, setAvatar, tab, setTab, search, setSearch,
    writerText, setWriterText,
    rounds, setRounds, writerMode, setWriterMode, imposters, setImposters,
    clueTime, setClueTime, discussionTime, setDiscussionTime,
    confirmed, setConfirmed, settingsLocked: Boolean(room?.locked),
    selectedVote, setSelectedVote, setDialog, setToast,
    createRoom, joinRoom, mode,
  };

  let content: React.ReactNode;
  switch (screen) {
    case "Splash": content = <Splash {...p} />; break;
    case "Welcome": content = <Welcome {...p} />; break;
    case "Create Room": content = <CreateRoom {...p} />; break;
    case "Join Room": content = <JoinRoom {...p} />; break;
    case "Avatar": content = <AvatarSelect {...p} />; break;
    case "Host Settings": content = <HostSettings {...p} />; break;
    case "Lobby": content = <Lobby {...p} />; break;
    case "Writer Input": content = <Writer {...p} />; break;
    case "Waiting": content = <Waiting {...p} />; break;
    case "Role Reveal": content = <RoleReveal {...p} />; break;
    case "Ready": content = <ReadyScreen {...p} />; break;
    case "Clue Phase": content = <CluePhase {...p} />; break;
    case "Discussion": content = <Discussion {...p} />; break;
    case "Round Result": content = <RoundResult {...p} />; break;
    case "Scoreboard": content = <Scoreboard {...p} />; break;
    case "Final Winner": content = <FinalWinner {...p} />; break;
    default: content = <About {...p} />;
  }

  const connectionTone = status === "online" ? "mint" : status === "reconnecting" ? "cream" : "grey";

  return (
    <main className="min-h-screen bg-[#f5eef4] p-3 font-[Nunito] text-foreground sm:p-8">
      <div className="relative mx-auto flex min-h-[780px] w-full max-w-[430px] flex-col overflow-hidden rounded-[36px] border-[7px] border-white bg-[#fffaf8] shadow-[0_22px_70px_rgba(116,78,115,.18)]">
        <Sky />
        <div className="relative flex items-center justify-between px-7 py-4">
          <span className="font-mono text-[10px] font-bold tracking-widest text-[#887a8d]">
            {room ? `#${room.code}` : "meow"}
          </span>
          <div className="h-2 w-23 rounded-full bg-[#5b5265]" />
          {inGame ? (
            <VoiceControls micOn={micOn} setMicOn={toggleMic} speakerOn={speakerOn} setSpeakerOn={toggleSpeaker} />
          ) : (
            <Badge tone={connectionTone as "mint"}>{status.toUpperCase()}</Badge>
          )}
        </div>
        <motion.div key={screen} initial={{ opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 24 }} className="relative flex flex-1 flex-col px-6 pb-6">
          {content}
        </motion.div>
        {toast && <Toast text={toast} />}
        {dialog === "leave" && (
          <LeaveDialog onStay={() => setDialog(null)} onLeave={() => { setDialog(null); leaveRoom(); }} />
        )}
        <Dialog open={dialog === "full"} emoji="🙀" title="This room is full" body="Oops! Every cushion is taken. Try another room code or make your own room." primary="Try again" onClose={() => setDialog(null)} />
        <Dialog open={dialog === "notFound"} emoji="🐾" title="Found no kitty room" body="That room code doesn’t seem to be open right meow. Double-check the code and try again." primary="Try again" onClose={() => setDialog(null)} />
        <Dialog open={dialog === "lost"} emoji="📶" title="Connection lost" body="We lost the yarn thread! Reconnecting you to the room right meow." primary="Keep trying" onClose={() => setDialog(null)} />
        <div className="relative flex items-center justify-between px-7 pb-5">
          <span className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#b19ba9]">
            {room ? `Round ${room.round} / ${room.maxRounds}` : "MeowMeow Imposter"}
          </span>
          {room && (
            <span className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#b19ba9]">
              {room.players.filter((x) => x.connected).length} online
            </span>
          )}
        </div>
      </div>
    </main>
  );
}

type Shared = Record<string, any>;

function screenForPhase(room: RoomState, isWriter: boolean) {
  switch (room.phase) {
    case "lobby": return "Lobby";
    case "writer": return isWriter ? "Writer Input" : "Waiting";
    case "roleReveal": return "Role Reveal";
    case "ready": return "Ready";
    case "clue": return "Clue Phase";
    case "discussion":
    case "voting": return "Discussion";
    case "result": return "Round Result";
    case "scoreboard": return "Scoreboard";
    case "winner": return "Final Winner";
    default: return "Lobby";
  }
}

function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#4b3d55]/35 px-6">
      <motion.div initial={{ scale: 0.9, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="w-full rounded-[28px] bg-white p-5 text-center shadow-[0_12px_0_rgba(116,78,115,.15)]">
        <div className="mx-auto grid size-16 place-items-center rounded-[45%] bg-[#fbe9ef] text-2xl">🥺</div>
        <h3 className="mt-3 font-[Baloo_2] text-2xl font-extrabold text-[#493e58]">Leave the room?</h3>
        <p className="mt-1 text-[13px] font-bold leading-5 text-[#887a8d]">Your paw print will be removed from the lobby. You can always hop back in later.</p>
        <div className="mt-4 space-y-2">
          <Button onClick={onStay}>Stay a bit</Button>
          <Button variant="ghost" onClick={onLeave}>Leave room</Button>
        </div>
      </motion.div>
    </div>
  );
}

function Mascot({ size = "size-40", emoji = "⌣", note }: { size?: string; emoji?: string; note?: string }) {
  return (
    <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }} className="relative">
      <div className="absolute -left-10 top-1 size-9 rounded-full bg-[#cfeaf7]" />
      <div className="absolute -right-10 top-12 size-6 rounded-full bg-[#ffe0a4]" />
      <div className={`grid ${size} place-items-center rounded-[45%] border-4 border-white bg-[#f6b2c8] text-4xl shadow-[inset_0_-12px_0_rgba(218,111,148,.25),0_12px_0_#e990ae]`}>{emoji}</div>
      <Sparkles className="absolute -right-3 -top-3 text-[#c3adeb]" />
      {note && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[10px] font-extrabold text-[#a58da2] shadow-sm">{note}</span>}
    </motion.div>
  );
}

function Splash({ go }: Shared) {
  return (
    <div className="flex flex-1 flex-col items-center justify-between py-8 text-center">
      <div className="mt-10"><Mascot /></div>
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.25em] text-[#ad90a5]">a tiny game of trust</p>
        <h1 className="mt-1 font-[Baloo_2] text-5xl font-extrabold leading-[.85] text-[#51455e]">meowmeow<br /><span className="text-[#ef6d9a]">imposter</span></h1>
        <p className="mx-auto mt-5 max-w-60 text-sm font-bold leading-6 text-[#8b7d91]">Find the sneaky kitty before the clues run out.</p>
        <div className="mt-5 flex items-center justify-center gap-2 text-[#c9a9bd]"><LoaderCircle className="animate-spin" size={16} /><span className="text-[11px] font-extrabold">loading whiskers…</span></div>
        <p className="mt-4 text-[10px] font-extrabold tracking-wide text-[#b19ba9]">Designed by Sazzat Zilan Sifat · v1.0.0</p>
      </div>
      <Button onClick={() => go("Welcome")} icon={ArrowRight}>Tap to play</Button>
    </div>
  );
}

function Welcome({ go, setMode }: Shared) {
  return (
    <div className="flex flex-1 flex-col">
      <Top title="Gather your kitties" sub="A cozy little mystery for 3–30 friends." />
      <div className="relative my-auto flex justify-center py-8">
        <div className="absolute size-52 rounded-full bg-[#fbe9ef]" />
        {avatarCatalog.slice(0, 3).map((a, i) => (
          <div key={a.name} className={`${i ? "-ml-5 mt-6" : ""} relative`}><Bean player={a} size="lg" ring /></div>
        ))}
      </div>
      <div className="space-y-3">
        <Button onClick={() => { setMode("create"); go("Create Room"); }} icon={Settings2}>Create room</Button>
        <Button variant="soft" onClick={() => { setMode("join"); go("Join Room"); }} icon={Users}>Join room</Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => go("About")} icon={Info}>About</Button>
          <Button variant="ghost" onClick={() => { setMode("create"); go("Host Settings"); }} icon={Settings2}>Settings</Button>
        </div>
        <p className="text-center text-[10px] font-extrabold text-[#b19ba9]">English (US) · v1.0.0</p>
      </div>
    </div>
  );
}

function CreateRoom({ go, back, nickname, setNickname }: Shared) {
  const invalid = nickname.trim().length > 0 && nickname.trim().length < 3;
  return (
    <div className="flex flex-1 flex-col">
      <Top title="Create room" sub="Pick a nickname and open your cozy corner." back onBack={back} />
      <div className="mb-4 flex justify-center"><Mascot size="size-24" emoji="✎" note="pick a name!" /></div>
      <label className="mt-4 block text-xs font-extrabold uppercase tracking-[.13em] text-[#8c788b]">Your nickname
        <input value={nickname} maxLength={12} onChange={(e) => setNickname(e.target.value)} placeholder="Enter your nickname…"
          className={`mt-2 h-14 w-full rounded-2xl border-2 bg-[#fff9fc] px-4 text-base font-bold text-[#594c63] outline-none ${invalid ? "border-[#f0a6ae]" : "border-[#e8d8e3] focus:border-[#ef8dad]"}`} />
      </label>
      <div className="mt-2 flex justify-between text-[10px] font-extrabold text-[#b19ba9]">
        <span className={invalid ? "text-[#d66470]" : ""}>{invalid ? "Nicknames need at least 3 letters." : "Visible to everyone in the room."}</span>
        <span>{nickname.length}/12</span>
      </div>
      <div className="mt-4 rounded-2xl bg-[#fff0cf] p-3 text-xs font-bold leading-5 text-[#8f7134]"><CircleHelp className="mr-1 inline size-4" />You’ll be the host, so you choose the pace of the match.</div>
      <div className="mt-auto"><Button disabled={nickname.trim().length < 3} onClick={() => go("Avatar")} icon={ArrowRight}>Choose avatar</Button></div>
    </div>
  );
}

function JoinRoom({ go, back, nickname, setNickname, code, setCode }: Shared) {
  const filled = code.every((c: string) => c !== "");
  const setDigit = (i: number, value: string) => {
    const next = [...code];
    next[i] = value.replace(/\D/g, "").slice(-1);
    setCode(next);
    if (next[i]) {
      const el = document.getElementById(`code-${i + 1}`);
      (el as HTMLInputElement | null)?.focus();
    }
  };
  return (
    <div className="flex flex-1 flex-col">
      <Top title="Join room" sub="Pop in the room code your host shared." back onBack={back} />
      <p className="mb-2 text-xs font-extrabold uppercase tracking-[.13em] text-[#8c788b]">Room code</p>
      <div className="flex justify-between gap-2">
        {code.map((c: string, i: number) => (
          <motion.input key={i} id={`code-${i}`} value={c} maxLength={1} inputMode="numeric" aria-label={`Room code digit ${i + 1}`}
            whileFocus={{ scale: 1.05 }}
            onChange={(e) => setDigit(i, e.target.value)}
            className="h-16 w-full rounded-2xl border-2 border-[#e8d8e3] bg-[#fff9fc] text-center font-mono text-2xl font-bold text-[#64526b] outline-none focus:border-[#ef8dad]" />
        ))}
      </div>
      <label className="mt-5 block text-xs font-extrabold uppercase tracking-[.13em] text-[#8c788b]">Your nickname
        <input value={nickname} maxLength={12} onChange={(e) => setNickname(e.target.value)}
          className="mt-2 h-14 w-full rounded-2xl border-2 border-[#e8d8e3] bg-[#fff9fc] px-4 text-base font-bold text-[#594c63] outline-none focus:border-[#ef8dad]" />
      </label>
      <div className="mt-4 rounded-2xl bg-[#eef7f2] p-3 text-xs font-bold leading-5 text-[#4b8f72]">🐾 Ask your host for the 5-digit code shown in their lobby.</div>
      <div className="mt-auto space-y-2">
        <Button disabled={!filled || nickname.trim().length < 3} onClick={() => go("Avatar")} icon={ArrowRight}>Choose avatar</Button>
      </div>
    </div>
  );
}

function AvatarSelect({ go, back, avatar, setAvatar, tab, setTab, search, setSearch, setToast, mode, joinRoom, room }: Shared) {
  const taken: string[] = room?.takenAvatars ?? [];
  const list = avatarCatalog.filter(
    (a) => a.kind === tab && a.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const picked = catalogEntry(avatar);
  const next = () => {
    if (mode === "create") go("Host Settings");
    else joinRoom();
  };
  const pickAvatar = (name: string) => {
    setAvatar(name);
    if (room) actions.selectAvatar(name);
    setToast(`${name} joined your side ✨`);
  };
  return (
    <div className="flex flex-1 flex-col">
      <Top title="Choose your avatar" sub="70 fluffy friends waiting to be picked." back onBack={back} />
      <div className="mb-3 flex h-11 items-center gap-2 rounded-2xl border-2 border-[#e8d8e3] bg-[#fff9fc] px-3">
        <Search size={16} className="text-[#bda6b7]" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search avatars…" className="w-full bg-transparent text-sm font-bold text-[#594c63] outline-none" />
      </div>
      <div className="mb-3 flex gap-1.5 rounded-2xl bg-[#faf4f8] p-1.5">
        {(["Boy", "Girl", "Creature"] as const).map((t) => (
          <motion.button key={t} whileTap={{ scale: 0.96 }} onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition ${tab === t ? "bg-white text-[#b04f73] shadow-[0_3px_0_#f0dbe5]" : "text-[#a08d9d]"}`}>{t}</motion.button>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-4 content-start gap-3 overflow-y-auto pb-3 [scrollbar-width:none]">
        {list.map((a) => {
          const isTaken = taken.includes(a.name) && a.name !== avatar;
          const active = a.name === avatar;
          return (
            <button key={a.name} disabled={isTaken} onClick={() => pickAvatar(a.name)}
              className={`relative grid place-items-center rounded-2xl p-1.5 transition ${active ? "bg-[#fff2cd] shadow-[0_4px_0_#f0dfae]" : "bg-white shadow-[0_3px_0_#f1e6ed]"} ${isTaken ? "opacity-45" : ""}`}>
              <Bean player={a} size="sm" dim={isTaken} />
              <span className="mt-1 truncate text-[9px] font-extrabold text-[#7d6a81]">{a.name}</span>
              {isTaken && <Lock size={12} className="absolute right-1 top-1 text-[#a08d9d]" />}
              {active && <Check size={12} className="absolute right-1 top-1 text-[#b04f73]" />}
            </button>
          );
        })}
        {!list.length && <p className="col-span-4 mt-6 text-center text-xs font-extrabold text-[#b19ba9]">No kitties match that name 🐾</p>}
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-[25px] bg-white p-3 shadow-[0_4px_0_#eee3e9]">
        <Bean player={picked} size="md" ring />
        <div className="min-w-0 flex-1">
          <p className="font-[Baloo_2] text-lg font-extrabold text-[#55495e]">{picked.name}</p>
          <p className="truncate text-xs font-bold text-[#a08d9d]">{picked.outfit} · {picked.personality}</p>
        </div>
        <Badge tone="mint"><Check size={10} /> PICKED</Badge>
      </div>
      <div className="mt-3"><Button onClick={next} icon={ArrowRight}>Confirm avatar</Button></div>
    </div>
  );
}

function HostSettings({ back, rounds, setRounds, writerMode, setWriterMode, imposters, setImposters, clueTime, setClueTime, discussionTime, setDiscussionTime, settingsLocked, confirmed, setConfirmed, room, self, createRoom, setToast }: Shared) {
  const live = Boolean(room);
  const canEdit = !live || (self?.isHost && !settingsLocked);
  const push = (patch: Record<string, unknown>) => {
    if (live) actions.updateSettings(patch);
  };
  return (
    <div className="flex flex-1 flex-col">
      <Top title="Host settings" sub="These settings apply to the whole match." back onBack={back} />
      <div className="flex-1 space-y-3 overflow-y-auto pb-3 [scrollbar-width:none]">
        <SliderCard title="Number of rounds" helper="How many tiny mysteries?" value={rounds - 1}
          setValue={(v: number) => { setRounds(v + 1); push({ rounds: v + 1 }); }} options={roundOptions} locked={!canEdit} />
        <Segmented title="Writer selection" helper="Who writes the secret word?" value={writerMode}
          setValue={(v: number) => { setWriterMode(v); push({ writerMode: v === 1 ? "random" : "sequential" }); }}
          options={[{ label: "Sequential", icon: "🔁", desc: "Turn by turn" }, { label: "Random", icon: "🎲", desc: "Fair random" }]} />
        <SliderCard title="Number of imposters" helper="Sneaky kitties in the room" value={imposters}
          setValue={(v: number) => { setImposters(v); push({ imposters: v + 1 }); }} options={imposterOptions} locked={!canEdit} />
        <SliderCard title="Clue time" helper="For each player’s clue" value={clueTime}
          setValue={(v: number) => { setClueTime(v); push({ clueSeconds: CLUE_SECONDS[v] }); }} options={clueOptions} locked={!canEdit} />
        <SliderCard title="Discussion time" helper="For the whole kitty debate" value={discussionTime}
          setValue={(v: number) => { setDiscussionTime(v); push({ discussionSeconds: DISCUSSION_SECONDS[v] }); }} options={discussionOptions} locked={!canEdit} />
        <div className="rounded-2xl bg-[#f4efff] p-3 text-xs font-bold leading-5 text-[#75658f]"><Lock className="mr-1 inline size-4" />Settings lock automatically as soon as the game begins.</div>
      </div>
      {!live && (
        <div className="space-y-2">
          <SlideConfirm label="Slide to confirm" done={confirmed} onDone={() => { setConfirmed(true); setToast("Settings locked in ✨"); }} />
          <Button disabled={!confirmed} onClick={createRoom} icon={Check}>Create the room</Button>
        </div>
      )}
    </div>
  );
}

function Lobby({ room, self, setToast, setDialog }: Shared) {
  const players: PublicPlayer[] = room.players;
  const enough = players.length >= 3;
  const share = async () => {
    const text = `Join my MeowMeow Imposter room: ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "MeowMeow Imposter", text });
      else {
        await navigator.clipboard.writeText(text);
        setToast("Invite copied 🐾");
      }
    } catch {
      setToast("Sharing cancelled");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setToast("Room code copied 🐾");
    } catch {
      setToast(`Room code: ${room.code}`);
    }
  };
  return (
    <div className="flex flex-1 flex-col">
      <Top title="The Cozy Corner" sub="Waiting for the whole little bunch." back onBack={() => setDialog("leave")} />
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-[#eee8ff] px-4 py-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#8a7bb5]">Room code</p>
          <p className="font-mono text-xl font-bold tracking-[.28em] text-[#5c4f7d]">{room.code}</p>
        </div>
        <div className="flex gap-1.5">
          <button aria-label="Copy code" onClick={copy} className="grid size-9 place-items-center rounded-xl bg-white text-[#7561aa] shadow-sm"><Copy size={16} /></button>
          <button aria-label="Share code" onClick={share} className="grid size-9 place-items-center rounded-xl bg-white text-[#7561aa] shadow-sm"><Share2 size={16} /></button>
          <span className="grid size-9 place-items-center rounded-xl bg-white text-[#4d9575] shadow-sm"><Wifi size={16} /></span>
        </div>
      </div>
      <div className="mb-3 flex gap-2">
        <Badge tone="mint"><Users size={10} /> {players.length}/30 KITTIES</Badge>
        <Badge tone="lavender"><Timer size={10} /> {room.settings.rounds} ROUNDS</Badge>
        <Badge tone="cream">{room.settings.imposters} IMPOSTER{room.settings.imposters > 1 ? "S" : ""}</Badge>
      </div>
      <div className="grid flex-1 grid-cols-3 content-start gap-3 overflow-y-auto pb-3 [scrollbar-width:none]">
        {players.map((player) => (
          <div key={player.id} className={`relative grid place-items-center rounded-2xl p-2 ${player.host ? "bg-[#fff2cd] shadow-[0_4px_0_#f0dfae]" : "bg-white shadow-[0_3px_0_#f1e6ed]"} ${player.connected ? "" : "opacity-45 grayscale"}`}>
            <Bean player={beanFor(player)} size="sm" />
            <span className="mt-1 truncate text-[10px] font-extrabold text-[#7d6a81]">{player.nickname}</span>
            {player.host && <Crown size={12} className="absolute right-1 top-1 text-[#d8a83f]" />}
            {!player.connected && <span className="absolute bottom-1 right-1 text-[9px] font-extrabold text-[#a08d9d]">offline</span>}
          </div>
        ))}
      </div>
      <div className="mt-3">
        {self?.isHost ? (
          <Button disabled={!enough} onClick={() => actions.startGame()} icon={ArrowRight}>
            {enough ? "Start game" : "Need 3+ kitties"}
          </Button>
        ) : (
          <Button variant="soft" disabled icon={LoaderCircle}>Waiting for the host…</Button>
        )}
      </div>
    </div>
  );
}

function Writer({ writerText, setWriterText, room, setDialog }: Shared) {
  const { label } = useCountdown(room.timer?.endsAt);
  return (
    <div className="flex flex-1 flex-col">
      <Top title="Write your secret word" sub="Only the innocent kitties will see this word." back onBack={() => setDialog("leave")} />
      <div className="my-3 flex justify-center"><Mascot size="size-24" emoji="✎" note={label} /></div>
      <div className="mt-4 rounded-[25px] bg-white p-4 shadow-[0_4px_0_#eee3e9]">
        <div className="mb-2 flex items-center gap-2 text-[#a08d9d]"><Pencil size={14} /><span className="text-xs font-extrabold uppercase tracking-[.13em]">Secret word</span></div>
        <input value={writerText} maxLength={18} autoFocus onChange={(e) => setWriterText(e.target.value)} placeholder="e.g. marshmallow"
          className="h-14 w-full rounded-2xl border-2 border-[#e8d8e3] bg-[#fff9fc] px-4 text-base font-bold text-[#594c63] outline-none focus:border-[#ef8dad]" />
        <div className="mt-2 flex justify-between text-[10px] font-extrabold text-[#b19ba9]"><span>Keep it guessable, not obvious.</span><span>{writerText.length}/18</span></div>
      </div>
      <div className="mt-3 rounded-2xl bg-[#fff0cf] p-3 text-xs font-bold leading-5 text-[#8f7134]"><Sparkles className="mr-1 inline size-4" />If the timer runs out we’ll pick a cozy word for you.</div>
      <div className="mt-auto"><Button disabled={!writerText.trim()} onClick={() => actions.submitWord(writerText.trim())} icon={Send}>Send secret word</Button></div>
    </div>
  );
}

function Waiting({ room }: Shared) {
  const [tip, setTip] = useState(0);
  const { label } = useCountdown(room?.timer?.endsAt);
  useEffect(() => { const t = setInterval(() => setTip((v) => (v + 1) % tips.length), 2600); return () => clearInterval(t); }, []);
  const writer = room?.players.find((x: PublicPlayer) => x.id === room.writerId);
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[.25em] text-[#ad90a5]">MeowMeow Imposter</p>
      <div className="my-auto flex flex-col items-center gap-6">
        <Mascot emoji="ᶻ 𝗓 𐰁" note={label} />
        <div className="flex items-center gap-2 text-[#c9a9bd]"><LoaderCircle className="animate-spin" size={18} /><span className="text-sm font-extrabold">Waiting for {writer?.nickname ?? "the Writer"}…</span></div>
        <motion.p key={tip} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-[13px] font-bold text-[#887a8d]">{tips[tip]}</motion.p>
      </div>
    </div>
  );
}

function RoleReveal({ room, self }: Shared) {
  const [flipped, setFlipped] = useState(false);
  const [ready, setReady] = useState(false);
  const { label } = useCountdown(room.timer?.endsAt);
  useEffect(() => { setFlipped(false); setReady(false); }, [room.round]);
  const role = self?.role;
  const isImposter = role === "imposter";
  const copy = isImposter
    ? { emoji: "🐱‍👤", title: "You are the Imposter", sub: "Blend in. Guess the word. Don’t get caught." }
    : role === "writer"
      ? { emoji: "✎", title: "You are the Writer", sub: "You chose the word — give fair clues." }
      : { emoji: "🐾", title: "You are a Kitty", sub: "Use the secret word to give a clue." };
  const revealText = isImposter ? null : self?.secretWord ?? null;
  const reveal = () => {
    if (ready) return;
    setFlipped(true);
    setReady(true);
    actions.roleSeen();
  };
  return (
    <div className="flex flex-1 flex-col">
      <Top title="Your role" sub="Tap the card to reveal it. Keep it secret!" />
      <div className="my-auto grid place-items-center">
        <motion.button onClick={reveal} animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.6 }}
          className={`grid h-64 w-56 place-items-center rounded-[32px] border-4 border-white text-center shadow-[0_12px_0_rgba(116,78,115,.15)] ${flipped ? "bg-[#e9e3fb]" : "bg-[#f6b2c8]"}`}>
          <div style={{ transform: flipped ? "rotateY(180deg)" : undefined }} className="px-5">
            {flipped ? (
              <>
                <p className="text-4xl">{copy.emoji}</p>
                <p className="mt-3 font-[Baloo_2] text-2xl font-extrabold text-[#5b4b86]">{revealText ? "Secret word" : copy.title}</p>
                <p className="mt-1 text-xs font-bold text-[#7d6ba8]">
                  {revealText ? revealText : copy.sub}
                </p>
              </>
            ) : (
              <>
                <p className="text-4xl">🐾</p>
                <p className="mt-3 font-[Baloo_2] text-2xl font-extrabold text-[#8a4a68]">Tap to reveal</p>
                <p className="mt-1 text-xs font-bold text-[#b0748f]">Only you can see this card.</p>
              </>
            )}
          </div>
        </motion.button>
        <div className="mt-4 flex gap-2">
          <Badge tone={self?.role === "imposter" ? "pink" : "mint"}>
            {self?.role === "imposter" ? "IMPOSTER" : self?.secretWord ? `SECRET WORD · ${self.secretWord}` : "NO WORD FOR YOU"}
          </Badge>
          <Badge tone="lavender">ROUND {room.round}</Badge>
        </div>
        <p className="mt-3 text-[11px] font-extrabold text-[#b19ba9]">Continuing in {label}</p>
      </div>
      <Button variant={ready ? "soft" : "primary"} onClick={reveal} icon={ready ? Check : ArrowRight}>
        {ready ? "Ready" : "Reveal my role"}
      </Button>
    </div>
  );
}

function ReadyScreen({ room, self }: Shared) {
  const players: PublicPlayer[] = room.players;
  const readyCount = players.filter((x) => x.ready).length;
  const { label } = useCountdown(room.timer?.endsAt);
  return (
    <div className="flex flex-1 flex-col text-center">
      <Top title="Are you ready?" sub="The mystery starts once everyone is set." />
      <div className="my-auto flex flex-col items-center gap-5">
        <Mascot emoji="ᵔᴥᵔ" note={label} />
        <TimerRing value={`${readyCount}/${players.length}`} label="ready" tone="pink" />
        <div className="flex flex-wrap justify-center gap-2">
          {players.map((player) => (
            <div key={player.id} className="relative"><Bean player={beanFor(player)} size="xs" dim={!player.connected} />
              {player.ready && <Check size={10} className="absolute -bottom-1 -right-1 rounded-full bg-[#dcf3e8] text-[#4b8f72]" />}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Button onClick={() => actions.ready()} disabled={self?.ready} variant={self?.ready ? "soft" : "primary"} icon={Check}>
          {self?.ready ? "You’re ready!" : "I’m ready"}
        </Button>
      </div>
    </div>
  );
}

function CluePhase({ room, playerId, self }: Shared) {
  const players: PublicPlayer[] = room.players;
  const order: string[] = room.speakingOrder;
  const speaker = players.find((x) => x.id === room.currentSpeakerId) ?? players[0]!;
  const turn = Math.max(1, order.indexOf(room.currentSpeakerId ?? "") + 1);
  const nextSpeaker = room.settings.writerMode === "sequential"
    ? players.find((x) => x.id === order[turn]) ?? null
    : null;
  const { label } = useCountdown(room.timer?.endsAt);
  const mine = room.currentSpeakerId === playerId;
  const spokenIds = order.slice(0, turn - 1);
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <Badge tone="lavender">ROUND {room.round} / {room.maxRounds}</Badge>
        <Badge tone="mint">TURN {turn} / {order.length}</Badge>
        <Badge tone="cream">{label}</Badge>
      </div>
      <div className="my-auto flex flex-col items-center gap-5">
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.6, repeat: Infinity }} className="grid place-items-center rounded-full bg-[#fdeaf1] p-5">
          <Bean player={beanFor(speaker)} size="lg" ring />
        </motion.div>
        <p className="font-[Baloo_2] text-2xl font-extrabold text-[#493e58]">{mine ? "Your turn!" : `${speaker.nickname} is speaking`}</p>
        <TimerRing value={label} label={label === "∞" ? "unlimited" : "clue time"} />
        {self?.secretWord && <Badge tone="mint">WORD · {self.secretWord}</Badge>}
        {nextSpeaker && (
          <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-[0_4px_0_#eee3e9]">
            <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#a58da2]">Next</p>
            <p className="font-[Baloo_2] text-lg font-extrabold text-[#493e58]">{nextSpeaker.nickname}</p>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {order.map((id: string) => {
            const player = players.find((x) => x.id === id);
            if (!player) return null;
            return <Bean key={id} player={beanFor(player)} size="xs" dim={spokenIds.includes(id)} />;
          })}
        </div>
      </div>
      <div className="mt-3">
        {mine ? (
          <Button onClick={() => actions.finishTurn()} icon={Check}>I’m done — next kitty</Button>
        ) : self?.isHost ? (
          <Button variant="ghost" onClick={() => actions.skipTurn()} icon={ArrowRight}>Skip this turn</Button>
        ) : (
          <Button variant="soft" disabled icon={Mic}>Listen closely…</Button>
        )}
      </div>
    </div>
  );
}

function Discussion({ room, self, playerId, selectedVote, setSelectedVote }: Shared) {
  const players: PublicPlayer[] = room.players;
  const canVote = room.phase === "discussion" || room.phase === "voting";
  const { label } = useCountdown(room.timer?.endsAt);
  const submitted = Boolean(self?.vote);
  const target = players.find((x) => x.id === selectedVote);
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-[0_4px_0_#eee3e9]">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#a58da2]">Round {room.round} · {canVote ? "discussion" : "discussion"}</p>
          <p className="font-[Baloo_2] text-xl font-extrabold text-[#493e58]">{label}</p>
        </div>
        <Badge tone="mint"><Wifi size={10} /> {room.voted.length}/{players.filter((x: PublicPlayer) => x.connected).length} VOTED</Badge>
      </div>
      <div className="grid flex-1 grid-cols-3 content-start gap-3 overflow-y-auto pb-3 [scrollbar-width:none]">
        {players.map((player) => {
          const picked = selectedVote === player.id;
          const isSelf = player.id === playerId;
          return (
            <button key={player.id} disabled={!canVote || submitted || isSelf || !player.connected}
              onClick={() => setSelectedVote(player.id)}
              className={`relative grid place-items-center rounded-2xl p-2 transition ${picked ? "bg-[#fff2cd] shadow-[0_4px_0_#f0dfae]" : "bg-white shadow-[0_3px_0_#f1e6ed]"} ${player.connected ? "" : "opacity-45 grayscale"} ${isSelf ? "opacity-70" : ""}`}>
              <Bean player={beanFor(player)} size="sm" />
              <span className="mt-1 truncate text-[10px] font-extrabold text-[#7d6a81]">{player.nickname}</span>
              {player.mic && <Mic size={11} className="absolute left-1 top-1 text-[#4d9575]" />}
              {player.voted && <Check size={11} className="absolute left-1 bottom-1 text-[#4b8f72]" />}
              {picked && <Vote size={12} className="absolute right-1 top-1 text-[#b04f73]" />}
            </button>
          );
        })}
      </div>
      <div className="mt-3 space-y-2">
        <Button disabled={!canVote || !selectedVote || submitted} onClick={() => selectedVote && actions.vote(selectedVote)}
          icon={submitted ? Check : Vote} variant={submitted ? "soft" : "primary"}>
          {submitted ? "✔ Voted" : canVote ? (target ? `Vote for ${target.nickname}` : "Pick a kitty") : "Voting is locked"}
        </Button>
      </div>
    </div>
  );
}

function RoundResult({ room, self }: Shared) {
  const result = room.result;
  const players: PublicPlayer[] = room.players;
  const out = players.find((x) => x.id === result?.eliminatedId);
  const { label } = useCountdown(room.timer?.endsAt);
  const innocentsWin = result?.winner === "innocents";
  return (
    <div className="flex flex-1 flex-col text-center">
      <Top title="Round result" sub="The votes are in — let’s see who’s out." />
      <div className="my-auto flex flex-col items-center gap-4">
        <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 240, damping: 18 }}
          className="w-full rounded-[28px] bg-white p-5 shadow-[0_8px_0_#eee3e9]">
          {out ? (
            <>
              <div className="flex justify-center"><Bean player={beanFor(out)} size="lg" ring /></div>
              <p className="mt-3 font-[Baloo_2] text-2xl font-extrabold text-[#493e58]">{out.nickname} was voted out</p>
              <p className="mt-1 text-[13px] font-bold text-[#887a8d]">
                They were {result?.eliminatedRole === "imposter" ? <span className="text-[#b04f73]">the Imposter</span> : <span className="text-[#4b8f72]">innocent</span>}!
              </p>
            </>
          ) : (
            <>
              <p className="text-4xl">🤷</p>
              <p className="mt-3 font-[Baloo_2] text-2xl font-extrabold text-[#493e58]">Nobody was voted out</p>
              <p className="mt-1 text-[13px] font-bold text-[#887a8d]">The vote tied, so everyone stays for now.</p>
            </>
          )}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Badge tone={innocentsWin ? "mint" : "pink"}>{innocentsWin ? "INNOCENTS WIN" : "IMPOSTERS WIN"}</Badge>
            <Badge tone="cream">+{result?.points ?? 0} POINTS</Badge>
            {result?.secretWord && <Badge tone="lavender">WORD · {result.secretWord}</Badge>}
          </div>
        </motion.div>
        <p className="text-3xl">🎉 🐾 ✨</p>
        <p className="text-[11px] font-extrabold text-[#b19ba9]">Scoreboard in {label}</p>
      </div>
      <Button onClick={() => actions.continueResult()} icon={ArrowRight} variant={self?.ready ? "soft" : "primary"}>Continue</Button>
    </div>
  );
}

function Scoreboard({ room, self }: Shared) {
  const ranked = [...(room.players as PublicPlayer[])].sort((a, b) => b.score - a.score);
  const medal: string[] = ["bg-[#fff2cd] shadow-[0_4px_0_#f0dfae]", "bg-[#f1f3f7] shadow-[0_4px_0_#dfe3ec]", "bg-[#fbe8d8] shadow-[0_4px_0_#eed3ba]"];
  const lastRound = room.round >= room.maxRounds;
  return (
    <div className="flex flex-1 flex-col">
      <Top title="Scoreboard" sub={`Round ${room.round} of ${room.maxRounds} · scores are counting up.`} />
      <div className="flex-1 space-y-2 overflow-y-auto pb-3 [scrollbar-width:none]">
        {ranked.map((player, i) => (
          <div key={player.id} className={`flex items-center gap-3 rounded-2xl p-3 ${medal[i] ?? "bg-white shadow-[0_3px_0_#f1e6ed]"}`}>
            <span className="w-5 text-center font-[Baloo_2] text-lg font-extrabold text-[#a58da2]">{i + 1}</span>
            <Bean player={beanFor(player)} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold text-[#55495e]">{player.nickname} {i === 0 && <Crown size={12} className="inline text-[#d8a83f]" />}</p>
              <p className="text-[10px] font-bold text-[#a08d9d]">+{player.roundScore} this round</p>
            </div>
            <span className="font-[Baloo_2] text-xl font-extrabold text-[#ef6d9a]">{player.score}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {self?.isHost ? (
          <>
            {!lastRound && <Button onClick={() => actions.nextRound()} icon={ArrowRight}>Next round</Button>}
            <Button variant={lastRound ? "primary" : "ghost"} onClick={() => actions.finishMatch()} icon={Trophy}>Finish game</Button>
          </>
        ) : (
          <Button variant="soft" disabled icon={LoaderCircle}>Waiting for the host…</Button>
        )}
      </div>
    </div>
  );
}

function FinalWinner({ room, self, go }: Shared) {
  const ranked = [...(room.players as PublicPlayer[])].sort((a, b) => b.score - a.score);
  const champion = ranked[0];
  return (
    <div className="flex flex-1 flex-col text-center">
      <Top title="Congratulations!" sub="What a cozy little mystery that was." />
      {champion && (
        <div className="flex flex-col items-center gap-3">
          <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity }} className="text-5xl">🏆</motion.div>
          <Bean player={beanFor(champion)} size="lg" ring />
          <p className="font-[Baloo_2] text-3xl font-extrabold text-[#493e58]">{champion.nickname}</p>
          <Badge tone="cream">{champion.score} POINTS</Badge>
        </div>
      )}
      <div className="mt-4 flex-1 space-y-2 overflow-y-auto pb-3 [scrollbar-width:none]">
        {ranked.slice(1).map((player, i) => (
          <div key={player.id} className="flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-[0_3px_0_#f1e6ed]">
            <span className="w-5 text-center font-[Baloo_2] font-extrabold text-[#a58da2]">{i + 2}</span>
            <Bean player={beanFor(player)} size="xs" />
            <p className="flex-1 truncate text-left font-extrabold text-[#55495e]">{player.nickname}</p>
            <span className="font-extrabold text-[#ef6d9a]">{player.score}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {self?.isHost ? (
          <>
            <Button onClick={() => actions.playAgain(false)} icon={ArrowRight}>Play again</Button>
            <Button variant="soft" onClick={() => actions.returnLobby()} icon={Users}>Return to lobby</Button>
          </>
        ) : (
          <Button variant="soft" disabled icon={LoaderCircle}>Waiting for the host…</Button>
        )}
        <Button variant="ghost" onClick={() => go("About")} icon={Info}>About</Button>
      </div>
    </div>
  );
}

function About({ back }: Shared) {
  return (
    <div className="flex flex-1 flex-col text-center">
      <Top title="About" sub="A cozy game of clues, trust and tiny paws." back onBack={back} />
      <div className="my-auto flex flex-col items-center gap-4">
        <Mascot size="size-28" emoji="ᵔᴥᵔ" />
        <div>
          <h2 className="font-[Baloo_2] text-3xl font-extrabold text-[#51455e]">MeowMeow Imposter</h2>
          <p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-[#a58da2]">version 1.0.0</p>
        </div>
        <p className="max-w-64 text-[13px] font-bold leading-6 text-[#887a8d]">Everyone gets a secret word — except the sneaky kitty. Give clues, chat, and vote out the imposter before the rounds run out.</p>
        <Badge tone="lavender">Designed by Sazzat Zilan Sifat</Badge>
        <div className="w-full space-y-2 pt-2">
          <Button variant="soft" onClick={back} icon={ArrowRight}>Back to the game</Button>
        </div>
      </div>
      <div className="hidden"><Skeleton /></div>
    </div>
  );
}
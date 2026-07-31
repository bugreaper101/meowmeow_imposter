import { actions, onVoiceClose, onVoiceSignal } from "./client";

// Small mesh: every player dials every other player. Fine for lobby-sized
// rooms; the server only relays signalling, never audio.
const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] }],
};

type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; polite: boolean; making: boolean };

const peers = new Map<string, Peer>();
let localStream: MediaStream | null = null;
let selfId: string | null = null;
let speakerOn = true;
let started = false;
let onLevel: ((speaking: boolean) => void) | null = null;
let analyserRaf = 0;

export function isVoiceStarted() {
  return started;
}

export async function startVoice(playerId: string, options?: { onSpeaking?: (speaking: boolean) => void }) {
  if (started) return true;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch {
    return false;
  }
  selfId = playerId;
  started = true;
  onLevel = options?.onSpeaking ?? null;
  watchLevel();
  onVoiceSignal(handleSignal);
  onVoiceClose(dropPeer);
  return true;
}

export function stopVoice() {
  cancelAnimationFrame(analyserRaf);
  for (const id of [...peers.keys()]) dropPeer(id);
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  started = false;
  selfId = null;
  onVoiceSignal(null);
  onVoiceClose(null);
}

export function setMicEnabled(enabled: boolean) {
  localStream?.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

export function setSpeakerEnabled(enabled: boolean) {
  speakerOn = enabled;
  for (const peer of peers.values()) peer.audio.muted = !enabled;
}

export function syncPeers(ids: string[]) {
  if (!started || !selfId) return;
  for (const id of ids) if (!peers.has(id)) void createPeer(id, id > selfId);
  for (const id of [...peers.keys()]) if (!ids.includes(id)) dropPeer(id);
}

async function createPeer(id: string, initiator: boolean) {
  if (!localStream || !selfId) return null;
  const pc = new RTCPeerConnection(ICE);
  const audio = typeof Audio === "undefined" ? ({} as HTMLAudioElement) : new Audio();
  audio.autoplay = true;
  audio.muted = !speakerOn;
  const peer: Peer = { pc, audio, polite: !initiator, making: false };
  peers.set(id, peer);

  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

  pc.ontrack = (event) => {
    audio.srcObject = event.streams[0] ?? null;
    void audio.play().catch(() => {
      /* autoplay blocked until the user interacts */
    });
  };
  pc.onicecandidate = (event) => {
    if (event.candidate) actions.rtc(id, { candidate: event.candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") dropPeer(id);
  };
  pc.onnegotiationneeded = async () => {
    try {
      peer.making = true;
      await pc.setLocalDescription();
      actions.rtc(id, { description: pc.localDescription });
    } catch {
      /* renegotiation will retry on the next state change */
    } finally {
      peer.making = false;
    }
  };
  return peer;
}

// Perfect-negotiation pattern: avoids glare when both sides offer at once.
async function handleSignal(from: string, raw: unknown) {
  if (!started) return;
  const signal = raw as { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
  let peer = peers.get(from);
  if (!peer) peer = (await createPeer(from, false)) ?? undefined;
  if (!peer) return;
  const { pc } = peer;

  try {
    if (signal.description) {
      const offerCollision = signal.description.type === "offer" && (peer.making || pc.signalingState !== "stable");
      if (offerCollision && !peer.polite) return;
      await pc.setRemoteDescription(signal.description);
      if (signal.description.type === "offer") {
        await pc.setLocalDescription();
        actions.rtc(from, { description: pc.localDescription });
      }
    } else if (signal.candidate) {
      await pc.addIceCandidate(signal.candidate);
    }
  } catch {
    /* ignore malformed or out-of-order signalling */
  }
}

function dropPeer(id: string) {
  const peer = peers.get(id);
  if (!peer) return;
  peer.pc.onicecandidate = null;
  peer.pc.ontrack = null;
  peer.pc.close();
  peer.audio.srcObject = null;
  peers.delete(id);
}

// Local mic level, used purely to animate the speaking ring.
function watchLevel() {
  if (!localStream || typeof AudioContext === "undefined" || !onLevel) return;
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(localStream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;

  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
    const next = peak > 12;
    if (next !== speaking) {
      speaking = next;
      onLevel?.(next);
    }
    analyserRaf = requestAnimationFrame(tick);
  };
  analyserRaf = requestAnimationFrame(tick);
}
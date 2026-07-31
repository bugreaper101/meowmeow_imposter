// Builds the sanitized state every client is allowed to see.
// Roles and the secret word never appear here.
export function publicRoom(room) {
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    maxRounds: room.settings.rounds,
    hostId: room.hostId,
    locked: room.locked,
    finished: room.phase === "winner",
    settings: { ...room.settings },
    writerId: room.writerId,
    speakingOrder: room.speakingOrder,
    currentSpeakerId: room.currentSpeakerId,
    timer: room.timer ? { phase: room.timer.phase, endsAt: room.timer.endsAt, duration: room.timer.duration } : null,
    takenAvatars: [...room.players.values()].map((p) => p.avatar).filter(Boolean),
    voted: [...room.players.values()].filter((p) => p.vote).map((p) => p.id),
    result: room.result,
    revealedWord: room.revealedWord,
    players: [...room.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        ready: p.ready,
        connected: p.connected,
        host: p.id === room.hostId,
        score: p.score,
        roundScore: p.roundScore,
        voted: Boolean(p.vote),
        mic: p.mic,
        speaker: p.speaker,
        speaking: p.id === room.currentSpeakerId,
        eliminated: room.eliminatedId === p.id,
      })),
  };
}

// Per-player private packet. Imposters never receive the secret word.
export function privateFor(room, player) {
  const role = player.role;
  // The writer wrote it, innocents were told it. Imposters never receive it.
  const canSeeWord = role === "player" || role === "writer";
  return {
    playerId: player.id,
    role: role,
    secretWord: canSeeWord ? room.secretWord : null,
    isWriter: room.writerId === player.id,
    isHost: room.hostId === player.id,
    roleSeen: player.roleSeen,
    ready: player.ready,
    vote: player.vote,
  };
}
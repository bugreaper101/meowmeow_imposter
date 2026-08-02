import { describe, expect, it } from 'vitest';
import { applyRoundScores } from './client';

describe('applyRoundScores', () => {
  it('rewards correct votes and penalizes wrong votes when the imposter is eliminated', () => {
    const players = [
      { id: 'imposter', role: 'imposter' as const, connected: true, vote: null, roundScore: 0, score: 0 },
      { id: 'p1', role: 'player' as const, connected: true, vote: 'imposter', roundScore: 0, score: 0 },
      { id: 'p2', role: 'player' as const, connected: true, vote: 'p1', roundScore: 0, score: 0 },
      { id: 'p3', role: 'player' as const, connected: true, vote: null, roundScore: 0, score: 0 },
    ];

    applyRoundScores(players as any, ['imposter'], 'imposter', false, false);

    expect(players[0].roundScore).toBe(-20);
    expect(players[1].roundScore).toBe(20);
    expect(players[2].roundScore).toBe(-10);
    expect(players[3].roundScore).toBe(0);
  });

  it('gives the imposter a big win bonus when they survive without a majority', () => {
    const players = [
      { id: 'imposter', role: 'imposter' as const, connected: true, vote: null, roundScore: 0, score: 0 },
      { id: 'p1', role: 'player' as const, connected: true, vote: 'imposter', roundScore: 0, score: 0 },
      { id: 'p2', role: 'player' as const, connected: true, vote: 'p1', roundScore: 0, score: 0 },
      { id: 'p3', role: 'player' as const, connected: true, vote: null, roundScore: 0, score: 0 },
    ];

    applyRoundScores(players as any, ['imposter'], null, false, false);

    expect(players[0].roundScore).toBe(50);
    expect(players[1].roundScore).toBe(10);
    expect(players[2].roundScore).toBe(-10);
    expect(players[3].roundScore).toBe(-10);
  });
});

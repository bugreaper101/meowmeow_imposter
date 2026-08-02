import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { SlideConfirm } from './ui';

const { roleSeenMock, readyMock } = vi.hoisted(() => ({
  roleSeenMock: vi.fn(),
  readyMock: vi.fn(),
}));

vi.mock('@/game/client', () => ({
  actions: {
    roleSeen: roleSeenMock,
    ready: readyMock,
  },
  clearError: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('@/game/store', () => ({
  useGame: () => ({ room: null, self: null, playerId: null, status: 'online', lastError: null, peers: [] }),
}));

vi.mock('@/game/useCountdown', () => ({
  useCountdown: () => ({ label: '10s' }),
}));

import { RoleReveal } from '../MeowMeowImposter';

describe('SlideConfirm', () => {
  it('confirms when the control is clicked', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();

    render(<SlideConfirm label="Slide to confirm" done={false} onDone={onDone} />);

    await user.click(screen.getByRole('button', { name: /slide to confirm/i }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('RoleReveal', () => {
  it('changes the reveal button into a readiness confirmation', async () => {
    const user = userEvent.setup();

    render(
      <RoleReveal
        room={{
          code: '12345',
          phase: 'roleReveal',
          round: 1,
          maxRounds: 10,
          timer: null,
          players: [],
          settings: {
            rounds: 10,
            imposters: 1,
            clueSeconds: 45,
            discussionSeconds: 180,
            writerMode: 'sequential',
          },
        } as any}
        self={{ role: 'player', secretWord: 'marshmallow', roleSeen: false, ready: false } as any}
      />,
    );

    await user.click(screen.getByRole('button', { name: /reveal my role/i }));

    expect(roleSeenMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /are you ready/i })).toBeInTheDocument();
  });
});

import { createGameFromSnapshot } from '@bf/sim';
import type { Command, Entity, Game, GameSnapshot } from '@bf/sim/types';
import type { SimLoop } from './simloop';

export const ORDER_NO_LONGER_AVAILABLE = 'Order no longer available';

type ManagedCommand = Extract<Command, { kind: 'build' | 'train' | 'research' }>;

function managed(command: Command): command is ManagedCommand {
  return command.kind === 'build' || command.kind === 'train' || command.kind === 'research';
}

function hasRequestId(command: Command): command is ManagedCommand & { requestId: number } {
  return managed(command) && command.requestId !== undefined;
}

/**
 * Human-command admission. Economic commands are previewed through an exact
 * cloned sim tick after every already-pending command, so rapid input cannot
 * promise resources or queue space that an earlier tap has already claimed.
 */
export class CommandAdmission {
  private nextRequestId: number;

  constructor(
    private readonly game: Game,
    private readonly loop: Pick<SimLoop, 'issue' | 'pendingSnapshot' | 'retract'>,
    private readonly feedback: (label: string, undo: (() => void) | null) => void,
  ) {
    let maxRequestId = 0;
    for (const entity of game.state.entities.values()) {
      maxRequestId = Math.max(maxRequestId, entity.requestId ?? 0);
      for (const item of entity.trainQueue ?? []) {
        maxRequestId = Math.max(maxRequestId, item.requestId ?? 0);
      }
    }
    this.nextRequestId = maxRequestId + 1;
  }

  issue(command: Command): boolean {
    const accepted = this.prepare(command);
    if (!accepted || !this.loop.issue(accepted)) {
      if (managed(command)) this.feedback(ORDER_NO_LONGER_AVAILABLE, null);
      return false;
    }
    return true;
  }

  issueWithUndo(
    command: Command,
    label: string,
    fallback: (() => void) | null,
  ): boolean {
    const accepted = this.prepare(command);
    if (!accepted || !this.loop.issue(accepted)) {
      if (managed(command)) this.feedback(ORDER_NO_LONGER_AVAILABLE, null);
      return false;
    }
    this.feedback(label, () => {
      if (this.loop.retract(accepted)) return;
      if (hasRequestId(accepted) && this.undoApplied(accepted)) return;
      fallback?.();
    });
    return true;
  }

  private prepare(command: Command): Command | null {
    if (!managed(command)) return command;
    const requestId = this.allocateRequestId();
    const candidate = { ...command, requestId } as ManagedCommand;
    return this.previewAccepts(candidate) ? candidate : null;
  }

  private allocateRequestId(): number {
    const used = new Set<number>();
    for (const command of this.loop.pendingSnapshot()) {
      if (managed(command) && command.requestId !== undefined) used.add(command.requestId);
    }
    while (used.has(this.nextRequestId)) this.nextRequestId++;
    return this.nextRequestId++;
  }

  private previewAccepts(candidate: ManagedCommand): boolean {
    try {
      const snapshot = this.game.serialize();
      const preview = createGameFromSnapshot(snapshot as GameSnapshot);
      const events = preview.advance([...this.loop.pendingSnapshot(), candidate]);
      if (candidate.kind === 'build') {
        return events.some((event) => event.kind === 'buildingPlaced'
          && preview.state.entities.get(event.id)?.requestId === candidate.requestId);
      }
      const building = preview.state.entities.get(candidate.buildingId);
      return building?.trainQueue?.some((item) => item.requestId === candidate.requestId) === true;
    } catch {
      return false;
    }
  }

  private undoApplied(command: ManagedCommand & { requestId: number }): boolean {
    if (command.kind === 'train') {
      const building = this.game.state.entities.get(command.buildingId);
      if (!building?.trainQueue?.some((item) => item.requestId === command.requestId)) return false;
      return this.loop.issue({
        kind: 'cancelTrain',
        player: command.player,
        buildingId: command.buildingId,
        requestId: command.requestId,
      });
    }
    if (command.kind === 'research') {
      const building = this.game.state.entities.get(command.buildingId);
      if (!building?.trainQueue?.some((item) => item.requestId === command.requestId)) return false;
      return this.loop.issue({
        kind: 'cancelResearch',
        player: command.player,
        buildingId: command.buildingId,
        requestId: command.requestId,
      });
    }
    let foundation: Entity | undefined;
    for (const entity of this.game.state.entities.values()) {
      if (entity.kind === 'building' && entity.player === command.player
        && entity.requestId === command.requestId
        && (entity.buildProgress ?? 1000) < 1000) {
        foundation = entity;
        break;
      }
    }
    if (!foundation) return false;
    return this.loop.issue({
      kind: 'deleteEntity', player: command.player, entityId: foundation.id,
    });
  }
}

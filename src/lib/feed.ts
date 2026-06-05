// Feed event types — the typed shape DialogPanel consumes. WS frames from
// the BE get translated into these by the game page's WS handler.

export type Power =
    | 'ENGLAND'
    | 'FRANCE'
    | 'GERMANY'
    | 'ITALY'
    | 'AUSTRIA'
    | 'RUSSIA'
    | 'TURKEY';

export const POWERS: readonly Power[] = [
    'ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'
] as const;

interface BaseEvent { id: number; }

export type FeedEvent =
    | (BaseEvent & { kind: 'phase'; label: string })
    | (BaseEvent & { kind: 'round_marker'; label: string })
    | (BaseEvent & { kind: 'message'; power: string; to: string; content: string; round: number })
    | (BaseEvent & { kind: 'message_sent'; to: string; content: string; round: number })
    | (BaseEvent & { kind: 'message_received'; from: string; content: string; round: number })
    | (BaseEvent & { kind: 'commitment'; power: string; text: string; type?: string; target?: string; kept?: boolean | null })
    | (BaseEvent & {
          kind: 'call';
          callId: string;
          initiator: string;
          recipient: string;
          topic: string;
          round: number;
          messages: Array<{ from: string; content: string }>;
          ended: boolean;
          endReason: string | null;
      })
    | (BaseEvent & {
          kind: 'order';
          power: string;
          accepted: string[];
          rejected: Array<{ order: string; error: string }>;
      })
    | (BaseEvent & { kind: 'thought'; text: string; phase?: string })
    | (BaseEvent & { kind: 'round_summary'; phase: string; headlines: string[] })
    | (BaseEvent & {
          kind: 'resolved';
          previous_phase: string;
          current_phase: string;
          sc_changes: Array<{ center: string; from: string | null; to: string }>;
      });

let _seq = 0;
export function nextId(): number { return ++_seq; }

// Build the seven empty per-power buckets.
export function emptyPerPower<T>(): Record<Power, T[]> {
    return Object.fromEntries(POWERS.map((p) => [p, [] as T[]])) as Record<Power, T[]>;
}

export function emptyNotes(): Record<Power, Array<{ phase: string; text: string }>> {
    return Object.fromEntries(POWERS.map((p) => [p, [] as Array<{ phase: string; text: string }>])) as unknown as Record<
        Power,
        Array<{ phase: string; text: string }>
    >;
}

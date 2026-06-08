// Shapes returned by the BE. Kept loose where the BE shape is in flux.

export type PhaseStep = 'negotiate' | 'orders' | 'adjudicate' | 'complete';

export interface Turn {
    year: number;
    season: 'Spring' | 'Fall' | 'Winter';
    phase: 'Movement' | 'Retreat' | 'Adjustment';
    type: 'M' | 'R' | 'A';
}

export interface PowerSummary {
    status: 'active' | 'eliminated';
    controller: string;
    centers: number;
    units: number;
    home_centers: string[];
}

export interface Unit {
    type: 'Army' | 'Fleet';
    power: string;
    location: string;
    raw: string;
    id: string;
}

export interface GameState {
    game_id: string;
    turn: Turn;
    phase_step: PhaseStep;
    powers: Record<string, PowerSummary>;
    units: Unit[];
    dislodged: unknown[];
    supply_centers: Record<string, string>;
    orderable: Record<string, string[]>;
    adjustments: Record<string, number>;
    messages: Array<{ from: string; to: string; content: string; round: number; turn: string }>;
    last_results: Record<string, unknown>;
    notes: Record<string, Array<{ phase: string; text: string }>>;
    commitments: unknown[];
    commitments_history: unknown[];
    last_phase: string;
    last_phase_orders: Record<string, string[]>;
    calls: unknown[];
    calls_history: unknown[];
    units_registry: Record<string, unknown>;
    winner: string | null;
    is_complete: boolean;
    agents_config: Record<string, { provider: string; policy: string }>;
    initialized: boolean;
    negotiation_rounds: number;
}

/** Lifecycle label written by the BE. Anything other than "active" means
 *  the game can't advance further — no phase calls accepted. */
export type GameTerminalStatus =
    | 'active'
    | 'complete'
    | 'errored'
    | 'abandoned'
    | 'stalled';

export interface GameSummary {
    game_id: string;
    terminal_status: GameTerminalStatus;
    winner: string | null;
    is_complete: boolean;
    turns: number;
    started_at: number;
    updated_at: number;
}

export interface User {
    id: string;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    email_verified: boolean;
    /** GitHub login if the user has linked GitHub; null/absent otherwise. */
    github_login?: string | null;
    /** True iff the user has a local password (i.e. can use Change password). */
    has_password?: boolean;
}

export interface Policy {
    label: string;
    summary?: string;
    rules?: string[];
}

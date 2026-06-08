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

export interface PowerUsage {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    /** Estimated provider cost in USD. Zero for models the catalog has no
     *  pricing entry for (avoids hard-failing on stale catalog data). */
    cost_usd: number;
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
    /** Lifecycle label. Anything non-active freezes the game. */
    terminal_status: GameTerminalStatus;
    /** True iff the game was created via the __free_trial__ preset.
     *  Gates the refund button. */
    free_trial: boolean;
    /** Per-power running totals of LLM token + cost spend. Keyed by power
     *  name (ENGLAND, FRANCE, ...). Missing power = no calls yet. */
    usage_by_power: Record<string, PowerUsage>;
    agents_config: Record<string, { provider: string; policy: string }>;
    initialized: boolean;
    negotiation_rounds: number;
}

/** Lifecycle label written by the BE. Anything other than "active" means
 *  the game can't advance further — no phase calls accepted. "refunded" is
 *  a terminal state set by the refund-and-retry flow; those games are
 *  hidden from the FE list. */
export type GameTerminalStatus =
    | 'active'
    | 'complete'
    | 'errored'
    | 'abandoned'
    | 'stalled'
    | 'refunded';

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
    /** Platform admin (project owner). Bypasses BYOK + refund-limit gates. */
    is_admin?: boolean;
    /** How many broken-game refunds the user has used. Drives the modal copy. */
    refunds_used?: number;
    /** Hard cap on refunds. Past this, the modal shows the GitHub link only. */
    refunds_limit?: number;
}

export interface Policy {
    label: string;
    summary?: string;
    rules?: string[];
}

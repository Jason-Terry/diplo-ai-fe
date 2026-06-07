// Imperative SVG map renderer. Loads the static Diplomacy SVG, hides the
// layers we don't want, and overlays per-power province fills + unit markers
// from engine state. Kept as a plain module so a tiny Svelte component can
// call it on mount and on state change without trying to re-implement all
// the DOM mutation in Svelte's reactive paradigm.

import type { GameState, Unit } from './types';

// Subset of the diplomacy library's province IDs that the SVG includes.
export const SEA_PROVINCES = new Set([
    'NAO', 'NWG', 'BAR', 'NTH', 'SKA', 'HEL', 'BAL', 'BOT', 'IRI', 'ENG',
    'MAO', 'WES', 'GOL', 'TYS', 'ION', 'ADR', 'AEG', 'EAS', 'BLA'
]);

export const KNOWN_PROVINCES: string[] = [
    'NAO', 'NWG', 'BAR', 'NTH', 'SKA', 'HEL', 'BAL', 'BOT', 'IRI', 'ENG',
    'MAO', 'WES', 'GOL', 'TYS', 'ION', 'ADR', 'AEG', 'EAS', 'BLA',
    'CLY', 'EDI', 'YOR', 'LVP', 'WAL', 'LON',
    'NWY', 'SWE', 'FIN', 'STP', 'DEN',
    'HOL', 'BEL', 'PIC', 'BRE', 'PAR', 'BUR', 'GAS', 'MAR', 'SPA', 'POR', 'NAF', 'TUN',
    'KIE', 'RUH', 'MUN', 'BER', 'PRU', 'SIL', 'BOH',
    'LVN', 'MOS', 'WAR', 'UKR', 'SEV', 'ARM',
    'GAL', 'VIE', 'TYR', 'BUD', 'TRI',
    'PIE', 'VEN', 'TUS', 'ROM', 'APU', 'NAP',
    'SER', 'RUM', 'BUL', 'ALB', 'GRE',
    'CON', 'ANK', 'SMY', 'SYR'
];

// SVG uses non-standard IDs for these seas; library calls them otherwise.
const SVG_ID_ALIAS: Record<string, string> = {
    NAO: 'nat',
    NWG: 'nrg',
    MAO: 'mid'
};

export const PROVINCE_NAMES: Record<string, string> = {
    NAO: 'North Atlantic Ocean', NWG: 'Norwegian Sea', BAR: 'Barents Sea',
    NTH: 'North Sea', SKA: 'Skagerrak', HEL: 'Heligoland Bight', BAL: 'Baltic Sea',
    BOT: 'Gulf of Bothnia', IRI: 'Irish Sea', ENG: 'English Channel',
    MAO: 'Mid-Atlantic Ocean', WES: 'Western Mediterranean', GOL: 'Gulf of Lyon',
    TYS: 'Tyrrhenian Sea', ION: 'Ionian Sea', ADR: 'Adriatic Sea',
    AEG: 'Aegean Sea', EAS: 'Eastern Mediterranean', BLA: 'Black Sea',
    CLY: 'Clyde', EDI: 'Edinburgh', YOR: 'Yorkshire', LVP: 'Liverpool',
    WAL: 'Wales', LON: 'London',
    NWY: 'Norway', SWE: 'Sweden', FIN: 'Finland', STP: 'St. Petersburg', DEN: 'Denmark',
    HOL: 'Holland', BEL: 'Belgium', PIC: 'Picardy', BRE: 'Brest', PAR: 'Paris',
    BUR: 'Burgundy', GAS: 'Gascony', MAR: 'Marseilles', SPA: 'Spain', POR: 'Portugal',
    NAF: 'North Africa', TUN: 'Tunis',
    KIE: 'Kiel', RUH: 'Ruhr', MUN: 'Munich', BER: 'Berlin', PRU: 'Prussia',
    SIL: 'Silesia', BOH: 'Bohemia',
    LVN: 'Livonia', MOS: 'Moscow', WAR: 'Warsaw', UKR: 'Ukraine', SEV: 'Sevastopol',
    ARM: 'Armenia',
    GAL: 'Galicia', VIE: 'Vienna', TYR: 'Tyrolia', BUD: 'Budapest', TRI: 'Trieste',
    PIE: 'Piedmont', VEN: 'Venice', TUS: 'Tuscany', ROM: 'Rome', APU: 'Apulia', NAP: 'Naples',
    SER: 'Serbia', RUM: 'Rumania', BUL: 'Bulgaria', ALB: 'Albania', GRE: 'Greece',
    CON: 'Constantinople', ANK: 'Ankara', SMY: 'Smyrna', SYR: 'Syria'
};

function cssVar(name: string): string {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function powerColor(power: string): string {
    return cssVar(`--power-${power.toLowerCase()}`) || '#888';
}

function selectProvince(svg: SVGSVGElement, abbr: string): SVGElement | null {
    const key = abbr.toUpperCase();
    const id = (SVG_ID_ALIAS[key] || key).toLowerCase();
    return svg.querySelector(`[id="${id}"]`);
}

function isParchment(): boolean {
    return document.documentElement.getAttribute('data-theme') === 'parchment';
}

/** Fetch the static SVG and inject it. Mutates the SVG once for layer setup. */
export async function loadMap(container: HTMLElement, svgUrl: string): Promise<SVGSVGElement> {
    if (container.querySelector('svg')) {
        return container.querySelector('svg') as SVGSVGElement;
    }
    const res = await fetch(svgUrl);
    const text = await res.text();
    container.innerHTML = text;
    const svg = container.querySelector('svg') as SVGSVGElement;
    svg.id = 'map-svg';
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    setupLayers(svg);
    attachProvinceTooltips(svg);
    return svg;
}

function setupLayers(svg: SVGSVGElement) {
    const parchment = isParchment();
    const bg = svg.querySelector('#background') as SVGElement | null;
    if (bg) bg.style.setProperty('display', parchment ? 'inline' : 'none', 'important');
    const noise = svg.querySelector('#layer1') as SVGElement | null;
    if (noise) noise.style.setProperty('display', 'none', 'important');
    const prov = svg.querySelector('#provinces') as SVGElement | null;
    if (prov) {
        prov.style.setProperty('display', 'inline', 'important');
        if (parchment) {
            svg.appendChild(prov);
            ['#supply-centers', '#province-centers', '#g1374', '#highlights',
                '#foreground', '#names', '#units', '#orders'].forEach((sel) => {
                const n = svg.querySelector(sel);
                if (n) svg.appendChild(n);
            });
        }
    }
    const labelFill = parchment ? '#3c2e1e' : '#e8d8be';
    svg.querySelectorAll('#names text, #foreground text').forEach((t) => {
        const el = t as SVGElement;
        el.style.setProperty('fill', labelFill, 'important');
        el.style.setProperty('stroke', 'none', 'important');
        el.style.setProperty('font-weight', '500', 'important');
        el.style.setProperty('paint-order', 'stroke', 'important');
    });
    svg.querySelectorAll(':scope > title, :scope > desc').forEach((n) => n.remove());
    ['#foreground', '#g1374', '#supply-centers', '#province-centers', '#highlights', '#names']
        .forEach((sel) => {
            const n = svg.querySelector(sel) as SVGElement | null;
            if (n) n.style.setProperty('pointer-events', 'none', 'important');
        });
}

// ─── Province centers ───────────────────────────────────────────────────────
//
// The Diplomacy SVG bundles cartographer-placed "center" markers in
// #province-centers — one <path id="xxxCenter"> per province whose `d`
// attribute begins with the absolute coordinate where the unit marker
// belongs. Using these instead of `getBBox().center` fixes drift on
// irregularly-shaped provinces like Moscow (whose bbox center sits
// well into the southern border because the province extends far
// north-east).
//
// PROVINCE_CENTER_OVERRIDES nudges the canonical center for the
// handful of provinces where it still reads wrong (label collisions,
// SC dot overlap, etc.). dx/dy are SVG-coordinate offsets.

const PROVINCE_CENTER_OVERRIDES: Record<string, { dx?: number; dy?: number }> = {
    // Add entries here when we find a province that needs a nudge.
};

let _centerCache: Map<string, { x: number; y: number }> | null = null;

function parseProvinceCenters(svg: SVGSVGElement): Map<string, { x: number; y: number }> {
    if (_centerCache) return _centerCache;
    const out = new Map<string, { x: number; y: number }>();
    // The cartographer split markers across TWO groups by province type:
    //   #supply-centers   — the 34 SC provinces (MOS, VIE, PAR, …)
    //   #province-centers — buffers and seas (BOH, GAL, NTH, …)
    // Scan both so every province gets a canonical center.
    const groups = [
        svg.querySelector('#supply-centers'),
        svg.querySelector('#province-centers')
    ];
    for (const group of groups) {
        if (!group) continue;
        group.querySelectorAll<SVGPathElement>('path[id$="Center"]').forEach((node) => {
            const id = node.id; // e.g. "mosCenter"
            const code = id.replace(/Center$/, '').toLowerCase();
            const d = node.getAttribute('d') || '';
            // First coord pair after the leading m/M is the start point in
            // absolute coordinates regardless of case (subsequent pairs
            // following a lowercase `m` ARE relative, but the FIRST one is
            // treated as absolute by the SVG spec).
            const m = d.match(/^\s*[mM]\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/);
            if (m) out.set(code, { x: parseFloat(m[1]), y: parseFloat(m[2]) });
        });
    }
    _centerCache = out;
    return out;
}

/** Best-effort centerpoint for a province in SVG user-space coords.
 *  Tries the canonical #province-centers marker first, falls back to
 *  the polygon bbox center. Applies any registered nudge override. */
export function provinceCenter(
    svg: SVGSVGElement,
    abbr: string
): { x: number; y: number } | null {
    const key = abbr.toUpperCase();
    const svgId = (SVG_ID_ALIAS[key] || key).toLowerCase();
    const centers = parseProvinceCenters(svg);

    let center = centers.get(svgId);
    if (!center) {
        // Sea provinces and a few oddballs aren't in #province-centers; bbox
        // of the polygon is the right fallback.
        const node = selectProvince(svg, abbr);
        if (!node) return null;
        let bbox: DOMRect;
        try {
            bbox = (node as SVGGraphicsElement).getBBox();
        } catch {
            return null;
        }
        center = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
    }
    const override = PROVINCE_CENTER_OVERRIDES[key];
    if (override) {
        center = {
            x: center.x + (override.dx ?? 0),
            y: center.y + (override.dy ?? 0)
        };
    }
    return center;
}

function attachProvinceTooltips(svg: SVGSVGElement) {
    svg.querySelectorAll('[id]').forEach((node) => {
        const el = node as SVGElement;
        if (!/^[a-z]{3}$/.test(el.id)) return;
        el.querySelectorAll(':scope > title').forEach((t) => t.remove());
        const code = el.id.toUpperCase();
        const name = PROVINCE_NAMES[code] || code;
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${name} (${code})`;
        el.appendChild(title);
    });
}

/** Reapply theme + state to an already-loaded map. Called on every state update. */
export function applyState(svg: SVGSVGElement, state: GameState) {
    setupLayers(svg);
    svg.querySelectorAll('.unit-marker, .transit-arrow').forEach((el) => el.remove());

    const parchment = isParchment();
    const seaFill = cssVar('--map-sea-fill') || '#1a2940';
    const landFill = cssVar('--map-land-fill') || '#2a3447';
    const stroke = cssVar('--map-stroke') || 'rgba(255,255,255,0.18)';

    // Base recolor every known province first.
    KNOWN_PROVINCES.forEach((abbr) => {
        const node = selectProvince(svg, abbr);
        if (!node) return;
        const isSea = SEA_PROVINCES.has(abbr);
        if (parchment) {
            if (isSea) {
                node.style.setProperty('fill', seaFill, 'important');
                node.style.setProperty('fill-opacity', '1', 'important');
            } else {
                node.style.setProperty('fill-opacity', '0', 'important');
            }
        } else {
            node.style.setProperty('fill', isSea ? seaFill : landFill, 'important');
            node.style.setProperty('fill-opacity', '1', 'important');
        }
        node.style.setProperty('stroke', stroke, 'important');
        node.style.setProperty('stroke-width', '0.75', 'important');
    });

    // Tint supply centers by owner.
    for (const [abbr, owner] of Object.entries(state.supply_centers || {})) {
        const node = selectProvince(svg, abbr);
        const color = powerColor(owner);
        if (node && color) {
            node.style.setProperty('fill', color, 'important');
            node.style.setProperty('fill-opacity', parchment ? '0.35' : '0.55', 'important');
        }
    }

    // Transit arrows render under units so the arrowhead is partly tucked
    // under the destination unit (reads as "arrived here" rather than
    // "going somewhere from here").
    drawTransits(svg, state);
    drawUnits(svg, state.units || [], false);
    drawUnits(svg, (state.dislodged || []) as Unit[], true);
}

// ─── Transit arrows ──────────────────────────────────────────────────────────
//
// For each unit, walk units_registry[unit.id].history. If the most recent
// "moved" entry's phase matches state.last_phase, draw a subtle quadratic-
// Bezier arc from the source province's centre to the destination's. Tinted
// with the unit's power color at low opacity so a busy board doesn't shout
// "history" louder than the units themselves.

interface MoveHistoryEntry {
    phase: string;
    kind: string;
    from?: string;
    to?: string;
}

// Only Movement-phase moves should generate transit arrows; retreats also
// produce "moved" history entries but they're a different visual story.
const MOVEMENT_PHASE_RE = /\bMOVEMENT\b/i;

/** Most recent Movement-phase string referenced anywhere in the registry.
 *  Used to clamp the arrow set to a single phase — if a unit moved in
 *  Spring 1901 but stood still in Fall 1901, we DON'T want its stale
 *  Spring arrow lingering on the Fall map. */
function latestMovementPhase(reg: Record<string, { history?: MoveHistoryEntry[] }>): string | null {
    let latest: string | null = null;
    let latestOrder = -1;
    for (const k in reg) {
        const history = reg[k]?.history;
        if (!history) continue;
        for (let i = history.length - 1; i >= 0; i--) {
            const h = history[i];
            if (h.kind !== 'moved' || !h.phase || !MOVEMENT_PHASE_RE.test(h.phase)) continue;
            // We can't compare phase strings as ordinals robustly, but history
            // is chronological per-unit — the LAST occurrence anywhere gives
            // us the freshest phase. Track the highest index seen across all
            // units to bias toward "what just resolved".
            if (i > latestOrder) {
                latestOrder = i;
                latest = h.phase;
            }
            break;  // freshest per unit is the only one that matters
        }
    }
    return latest;
}

function lastMoveFor(
    reg: Record<string, { history?: MoveHistoryEntry[] }>,
    unitId: string,
    targetPhase: string | null
): { from: string; to: string } | null {
    const history = reg?.[unitId]?.history;
    if (!history || !history.length) return null;
    // Walk backwards; the freshest "moved" wins. Filter to Movement phases
    // only — retreats also emit `moved` entries and we don't want them.
    for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i];
        if (h.kind !== 'moved' || !h.from || !h.to) continue;
        if (!h.phase || !MOVEMENT_PHASE_RE.test(h.phase)) continue;
        if (targetPhase && h.phase !== targetPhase) return null;
        return { from: h.from, to: h.to };
    }
    return null;
}

interface TransitGeom {
    /** Quadratic-Bezier path for the line, stopping short of the arrowhead. */
    arcD: string;
    /** Filled triangle path for the arrowhead. */
    headD: string;
}

function transitGeometry(
    from: { x: number; y: number },
    to: { x: number; y: number }
): TransitGeom | null {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return null;

    // Pixel budgets (all in SVG user units; ~1 user ≈ 0.88 device px at
    // a 1500-wide map). The arrowhead is drawn manually so we can put a
    // visible gap between it and the line tail.
    const START_TRIM = 22;   // line start clears the source pip
    const TIP_TRIM = 24;     // arrowhead tip sits this far from dest centre
    const HEAD_LEN = 22;     // length of the arrowhead triangle
    const HEAD_WIDTH = 18;   // base width of the arrowhead triangle
    const GAP = 8;           // visible gap between line end and head base

    const tStart = START_TRIM / dist;
    const tTip = 1 - TIP_TRIM / dist;
    if (tTip <= tStart) return null;

    const sx = from.x + dx * tStart;
    const sy = from.y + dy * tStart;
    const tipX = from.x + dx * tTip;
    const tipY = from.y + dy * tTip;

    // Quadratic control point: midpoint of the trimmed segment, shifted
    // perpendicular to the right of the travel direction by 12% of the
    // original distance. Always-right reads as a consistent visual pattern.
    const mx = (sx + tipX) / 2;
    const my = (sy + tipY) / 2;
    const off = dist * 0.12;
    const segDx = tipX - sx;
    const segDy = tipY - sy;
    const segLen = Math.hypot(segDx, segDy);
    const perpX = -segDy / segLen;
    const perpY = segDx / segLen;
    const cx = mx + perpX * off;
    const cy = my + perpY * off;

    // Tangent direction at the tip (cp → tip), normalised.
    const tanX = tipX - cx;
    const tanY = tipY - cy;
    const tanLen = Math.hypot(tanX, tanY);
    const ux = tanX / tanLen;
    const uy = tanY / tanLen;

    // Line ends back from the tip by HEAD_LEN + GAP so the gap is real
    // empty space, not "hidden under the arrowhead".
    const lineEndX = tipX - ux * (HEAD_LEN + GAP);
    const lineEndY = tipY - uy * (HEAD_LEN + GAP);

    // Arrowhead triangle: tip + two base corners perpendicular to the
    // tangent.
    const baseX = tipX - ux * HEAD_LEN;
    const baseY = tipY - uy * HEAD_LEN;
    const npX = -uy;
    const npY = ux;
    const b1X = baseX + npX * (HEAD_WIDTH / 2);
    const b1Y = baseY + npY * (HEAD_WIDTH / 2);
    const b2X = baseX - npX * (HEAD_WIDTH / 2);
    const b2Y = baseY - npY * (HEAD_WIDTH / 2);

    return {
        arcD: `M ${sx} ${sy} Q ${cx} ${cy} ${lineEndX} ${lineEndY}`,
        headD: `M ${tipX} ${tipY} L ${b1X} ${b1Y} L ${b2X} ${b2Y} z`
    };
}

function drawTransits(svg: SVGSVGElement, state: GameState): void {
    const units = state.units || [];
    const reg = (state.units_registry || {}) as Record<string, { history?: MoveHistoryEntry[] }>;
    if (!units.length || !Object.keys(reg).length) return;

    // Anchor on the most recent Movement-phase string anywhere in the
    // registry. Arrows persist through the subsequent Retreats / Adjustments
    // / next-turn Negotiations and only flip when a new Movement resolves.
    const targetPhase = latestMovementPhase(reg);
    if (!targetPhase) return;

    units.forEach((unit) => {
        const move = lastMoveFor(reg, unit.id, targetPhase);
        if (!move) return;
        const from = provinceCenter(svg, move.from);
        const to = provinceCenter(svg, move.to);
        if (!from || !to) return;
        const geom = transitGeometry(from, to);
        if (!geom) return;

        const stroke = powerColor(unit.power);
        const OUTLINE = 'rgba(0,0,0,0.55)';

        // Four-element render so the outline reads as a single continuous
        // shape under both the line and the head:
        //   line outline → head outline → line fill → head fill
        // Painter's order, line ends short of the head so the gap is real.

        const lineOutline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        lineOutline.setAttribute('class', 'transit-arrow transit-arrow-outline');
        lineOutline.setAttribute('d', geom.arcD);
        lineOutline.setAttribute('fill', 'none');
        lineOutline.setAttribute('stroke', OUTLINE);
        lineOutline.setAttribute('stroke-width', '14');
        lineOutline.setAttribute('stroke-linecap', 'round');
        lineOutline.style.pointerEvents = 'none';
        svg.appendChild(lineOutline);

        const headOutline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        headOutline.setAttribute('class', 'transit-arrow transit-arrow-outline');
        headOutline.setAttribute('d', geom.headD);
        headOutline.setAttribute('fill', OUTLINE);
        headOutline.setAttribute('stroke', OUTLINE);
        headOutline.setAttribute('stroke-width', '6');
        headOutline.setAttribute('stroke-linejoin', 'round');
        headOutline.style.pointerEvents = 'none';
        svg.appendChild(headOutline);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('class', 'transit-arrow');
        line.setAttribute('d', geom.arcD);
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', stroke);
        line.setAttribute('stroke-width', '10');
        line.setAttribute('stroke-linecap', 'round');
        line.style.pointerEvents = 'none';
        svg.appendChild(line);

        const head = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        head.setAttribute('class', 'transit-arrow');
        head.setAttribute('d', geom.headD);
        head.setAttribute('fill', stroke);
        head.setAttribute('stroke', stroke);
        head.setAttribute('stroke-width', '0');
        head.setAttribute('stroke-linejoin', 'round');
        head.style.pointerEvents = 'none';
        svg.appendChild(head);
    });
}

function drawUnits(svg: SVGSVGElement, units: Unit[], dislodged: boolean) {
    units.forEach((unit) => {
        const center = provinceCenter(svg, unit.location);
        if (!center) return;
        const cx = center.x;
        const cy = center.y;

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', `unit-marker ${dislodged ? 'dislodged' : ''}`);
        if (unit.id) {
            group.setAttribute('data-unit-id', unit.id);
            group.style.cursor = 'pointer';
        }

        const bg = unit.type === 'Fleet'
            ? document.createElementNS('http://www.w3.org/2000/svg', 'rect')
            : document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        if (unit.type === 'Fleet') {
            bg.setAttribute('x', String(cx - 14));
            bg.setAttribute('y', String(cy - 10));
            bg.setAttribute('width', '28');
            bg.setAttribute('height', '20');
            bg.setAttribute('rx', '4');
        } else {
            bg.setAttribute('cx', String(cx));
            bg.setAttribute('cy', String(cy));
            bg.setAttribute('r', '13');
        }
        bg.setAttribute('fill', powerColor(unit.power));
        bg.setAttribute('stroke', dislodged ? '#ff6b6b' : cssVar('--unit-stroke') || '#0b0f19');
        bg.setAttribute('stroke-width', '2');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(cy + 4));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'unit-label');
        text.textContent = unit.type === 'Fleet' ? 'F' : 'A';

        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        const locName = PROVINCE_NAMES[unit.location] || unit.location;
        title.textContent = `${unit.power} ${unit.type} — ${locName}${dislodged ? ' (dislodged)' : ''}`;
        group.appendChild(title);
        group.appendChild(bg);
        group.appendChild(text);
        svg.appendChild(group);
    });
}

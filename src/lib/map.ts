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
    svg.querySelectorAll('.unit-marker').forEach((el) => el.remove());

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

    drawUnits(svg, state.units || [], false);
    drawUnits(svg, (state.dislodged || []) as Unit[], true);
}

function drawUnits(svg: SVGSVGElement, units: Unit[], dislodged: boolean) {
    units.forEach((unit) => {
        const path = selectProvince(svg, unit.location);
        if (!path) return;
        let bbox: DOMRect;
        try {
            bbox = (path as SVGGraphicsElement).getBBox();
        } catch {
            return;
        }
        const cx = bbox.x + bbox.width / 2;
        const cy = bbox.y + bbox.height / 2;

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

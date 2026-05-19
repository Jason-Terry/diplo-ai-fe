// MetisDolos — frontend controller.

// API_BASE_URL / WS_BASE come from js/config.js. Default is same-origin so
// the monorepo dev server keeps working with no further changes.
const API = (window.API_BASE_URL || '');
const WS  = (window.WS_BASE || `ws://${window.location.host}`);

const POWERS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'];
const VICTORY_SC = 18;

const MODEL_OPTIONS = [
    { value: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast)' },
    { value: 'anthropic/claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
];

let policies = {};        // populated from /api/policies
let phaseStep = 0;
let gameState = null;
let ws = null;

// Tab state
let activeTab = 'ALL';
// Per-tab buffers: { ALL: [events], ENGLAND: { notes: [{phase, text}], events }, ... }
const tabs = {
    ALL: { events: [] },
    ...Object.fromEntries(POWERS.map(p => [p, { notes: [], events: [] }])),
};
// Live activity tracking per power. A power is "active" while we're receiving
// stream chunks for it and not yet seen its final thought event.
const activity = {}; // power -> { channel, lastChunkAt }

document.addEventListener('DOMContentLoaded', async () => {
    applyTheme(localStorage.getItem('theme') || 'dark');
    applyLayoutMode(localStorage.getItem('layoutMode') || 'map');
    await fetchPolicies();
    await loadGameState();
    renderTabs();
    connectWebSocket();

    // Clicking the small map in dialog mode flips back to map mode
    document.getElementById('map-section').addEventListener('click', (e) => {
        const layout = document.getElementById('app-layout');
        if (layout.classList.contains('layout-dialog') && e.target.closest('#map-svg')) {
            applyLayoutMode('map');
        }
    });
});

function toggleTheme() {
    const cur = document.body.classList.contains('theme-parchment') ? 'parchment' : 'dark';
    applyTheme(cur === 'dark' ? 'parchment' : 'dark');
    // Re-render the map so layers/colors re-evaluate against the new theme
    const svg = document.getElementById('map-svg');
    if (svg) svg.parentNode.removeChild(svg);
    if (gameState) renderMapSVG();
}

function applyTheme(theme) {
    document.body.classList.remove('theme-dark', 'theme-parchment');
    document.body.classList.add(theme === 'parchment' ? 'theme-parchment' : 'theme-dark');
    localStorage.setItem('theme', theme);
    const label = document.getElementById('theme-btn-label');
    if (label) label.textContent = theme === 'parchment' ? '☼ Parchment' : '☾ Dark';
}

function toggleLayoutMode() {
    const cur = document.getElementById('app-layout').classList.contains('layout-dialog')
        ? 'dialog' : 'map';
    applyLayoutMode(cur === 'dialog' ? 'map' : 'dialog');
}

function applyLayoutMode(mode) {
    const layout = document.getElementById('app-layout');
    layout.classList.remove('layout-map', 'layout-dialog');
    layout.classList.add(mode === 'dialog' ? 'layout-dialog' : 'layout-map');
    localStorage.setItem('layoutMode', mode);
    const label = document.getElementById('layout-btn-label');
    if (label) label.textContent = mode === 'dialog' ? '⇆ Map' : '⇆ Dialog';
    if (typeof renderTabBody === 'function' && document.getElementById('live-stream-container')) {
        renderTabBody();
    }
}

// ---------- API ----------

async function fetchPolicies() {
    try {
        const res = await fetch(`${API}/api/policies`);
        const data = await res.json();
        policies = data.policies || {};
    } catch (e) {
        console.error('Failed to load policies', e);
        policies = { WILDCARD: { label: 'Wildcard', summary: '', rules: [] } };
    }
}

async function loadGameState() {
    try {
        const res = await fetch(`${API}/api/state`);
        gameState = await res.json();
        renderTurnInfo();
        renderRoster();
        renderWinnerBanner();
        await renderMapSVG();
        syncActionButton();
        hydrateTabsFromState();
        renderTabs();
    } catch (err) {
        console.error('loadGameState failed', err);
    }
}

// Repopulate tab buffers from the server's persisted state so refreshing the
// page doesn't lose context. Thoughts are NOT persisted (transient) so they
// only appear via live WebSocket events.
function hydrateTabsFromState() {
    if (!gameState) return;

    // Notes (per-power append-only buffer)
    for (const [power, list] of Object.entries(gameState.notes || {})) {
        if (tabs[power]) tabs[power].notes = list || [];
    }

    // Don't blow away in-memory event arrays if we already have them from a live session.
    const allEmpty = tabs.ALL.events.length === 0 && POWERS.every(p => tabs[p].events.length === 0);
    if (!allEmpty) return;

    // Replay messages this turn
    for (const m of gameState.messages || []) {
        if (m.from && tabs[m.from]) {
            tabs[m.from].events.push({
                kind: 'message_sent',
                to: m.to, content: m.content, round: m.round || 0,
            });
        }
        if (m.to && tabs[m.to]) {
            tabs[m.to].events.push({
                kind: 'message_received',
                from: m.from, content: m.content, round: m.round || 0,
            });
        }
        tabs.ALL.events.push({
            kind: 'message',
            power: m.from, to: m.to, content: m.content, round: m.round || 0,
        });
    }

    // Replay commitments (current + history)
    const allCommits = [...(gameState.commitments_history || []), ...(gameState.commitments || [])];
    for (const c of allCommits) {
        const event = {
            kind: 'commitment',
            power: c.power, text: c.text, type: c.type, target: c.target,
            kept: c.kept ?? undefined,
        };
        if (tabs[c.power]) tabs[c.power].events.push(event);
        tabs.ALL.events.push(event);
    }

    // Replay calls (current phase + history)
    const allCalls = [...(gameState.calls_history || []), ...(gameState.calls || [])];
    // Dedupe by id since calls_history overlaps with calls
    const seen = new Set();
    for (const c of allCalls) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        const event = {
            kind: 'call',
            callId: c.id,
            initiator: c.initiator,
            recipient: c.recipient,
            topic: c.topic,
            round: c.round || 0,
            messages: c.messages || [],
            ended: c.ended ?? true,
            endReason: c.end_reason,
        };
        tabs.ALL.events.push(event);
        if (tabs[c.initiator]) tabs[c.initiator].events.push(event);
        if (tabs[c.recipient]) tabs[c.recipient].events.push(event);
    }
}

// ---------- Header / phase / button ----------

function renderTurnInfo() {
    document.getElementById('season').textContent = gameState.turn.season;
    document.getElementById('year').textContent = gameState.turn.year;
    document.getElementById('phase').textContent = gameState.turn.phase;
    document.getElementById('round-indicator').classList.add('hidden');
}

function syncActionButton() {
    const reset = document.getElementById('reset-btn');
    reset.classList.toggle('hidden', !gameState.initialized);

    if (gameState.is_complete) {
        phaseStep = 7;
        setButton('Game Over', true);
        return;
    }
    if (!gameState.initialized) {
        phaseStep = 0;
        setButton('Initialize Game', false);
        return;
    }
    const t = gameState.turn.type;
    if (phaseStep === 0) phaseStep = t === 'M' ? 1 : 3;
    if (phaseStep === 1 && t !== 'M') phaseStep = 3;
    const label = {
        1: 'Run Negotiations',
        3: t === 'A' ? 'Submit Builds/Disbands'
            : t === 'R' ? 'Submit Retreats'
            : 'Submit Orders',
        5: 'Resolve Turn',
    }[phaseStep];
    if (label) setButton(label, false);
}

function setButton(text, disabled) {
    const btn = document.getElementById('action-btn');
    btn.textContent = text;
    btn.disabled = disabled;
}

function handleActionClick() {
    if (phaseStep === 0) return showSetupModal();
    if (phaseStep === 1) return runNegotiations();
    if (phaseStep === 3) return runOrders();
    if (phaseStep === 5) return runAdjudicate();
}

// ---------- Roster ----------

function renderRoster() {
    const root = document.getElementById('roster-list');
    if (!gameState.initialized) {
        root.innerHTML = '<div class="empty-state">No game running. Click <em>Initialize Game</em>.</div>';
        return;
    }
    const adj = gameState.adjustments || {};
    const isAdj = gameState.turn.type === 'A';
    root.innerHTML = '';
    POWERS.forEach(power => {
        const p = gameState.powers[power] || { centers: 0, units: 0, status: 'eliminated' };
        const cfg = (gameState.agents_config || {})[power] || {};
        const a = adj[power] || 0;
        const aHint = !isAdj ? '' : a > 0 ? ` · +${a} build` : a < 0 ? ` · ${a} disband` : '';
        const elim = p.status === 'eliminated' ? ' eliminated' : '';
        const modelLabel = (MODEL_OPTIONS.find(m => m.value === cfg.provider) || {}).label || cfg.provider || '';
        const policyLabel = (policies[cfg.policy] || {}).label || cfg.policy || '';
        root.insertAdjacentHTML('beforeend', `
            <div class="roster-card${elim}" data-power="${power}" onclick="switchTab('${power}')">
                <span class="roster-swatch" style="background:var(--power-${power.toLowerCase()})"></span>
                <div class="roster-body">
                    <div class="roster-name">${power}</div>
                    <div class="roster-stats">
                        <span class="sc-count">${p.centers} SC</span>
                        <span class="unit-count">${p.units || 0} units</span>${aHint}
                    </div>
                    <div class="roster-traits">${modelLabel ? modelLabel + ' · ' : ''}${policyLabel}</div>
                </div>
            </div>
        `);
    });
}

function renderWinnerBanner() {
    const banner = document.getElementById('winner-banner');
    if (gameState.winner) {
        document.getElementById('winner-name').textContent = gameState.winner;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

// ---------- Map ----------

function getCssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
}
function getPowerColor(power) {
    return getCssVar(`--power-${power.toLowerCase()}`);
}
function getSeaFill()  { return getCssVar('--map-sea-fill')  || '#1a2940'; }
function getLandFill() { return getCssVar('--map-land-fill') || '#2a3447'; }
function getMapStroke(){ return getCssVar('--map-stroke')    || 'rgba(255,255,255,0.18)'; }

// Some sea provinces are stored with non-standard 3-letter IDs in this SVG.
// Translate from the python `diplomacy` library's codes → SVG codes.
const SVG_ID_ALIAS = {
    NAO: 'nat',   // North Atlantic Ocean → "nat"
    NWG: 'nrg',   // Norwegian Sea → "nrg"
    MAO: 'mid',   // Mid-Atlantic Ocean → "mid"
};

function selectProvince(svg, abbr) {
    const key = abbr.toUpperCase();
    const id = (SVG_ID_ALIAS[key] || key).toLowerCase();
    return svg.querySelector(`[id="${id}"]`);
}

async function renderMapSVG() {
    const container = document.getElementById('map-container');
    if (!document.getElementById('map-svg')) {
        const res = await fetch('data/map.svg');
        const svgText = await res.text();
        container.innerHTML = svgText;
        const svg = container.querySelector('svg');
        svg.id = 'map-svg';
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        toggleSvgLayers(svg);
        attachProvinceTooltips(svg);
        baseRecolorMap(svg);
    }

    const svg = document.getElementById('map-svg');
    svg.querySelectorAll('.unit-marker').forEach(el => el.remove());

    const parchment = document.body.classList.contains('theme-parchment');
    const seaFill = getSeaFill();
    const landFill = getLandFill();

    KNOWN_PROVINCES.forEach(abbr => {
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
    });

    for (const [abbr, owner] of Object.entries(gameState.supply_centers || {})) {
        const node = selectProvince(svg, abbr);
        const color = getPowerColor(owner);
        if (node && color) {
            node.style.setProperty('fill', color, 'important');
            node.style.setProperty('fill-opacity', parchment ? '0.35' : '0.55', 'important');
        }
    }

    drawUnits(svg, gameState.units || [], false);
    drawUnits(svg, gameState.dislodged || [], true);
    renderLegend();
}

function toggleSvgLayers(svg) {
    const parchment = document.body.classList.contains('theme-parchment');
    // Background paper rect: keep under parchment (cream base), hide for dark.
    const bg = svg.querySelector('#background');
    if (bg) bg.style.setProperty('display', parchment ? 'inline' : 'none', 'important');
    // Noise/texture: hide in BOTH themes. Under parchment the underlying paper
    // rect alone is enough — the noise pattern paints the unmarked Atlantic /
    // Norwegian Sea regions darker than the rest of the map.
    const noise = svg.querySelector('#layer1');
    if (noise) noise.style.setProperty('display', 'none', 'important');
    const prov = svg.querySelector('#provinces');
    if (prov) {
        prov.style.setProperty('display', 'inline', 'important');
        // The paper texture (noise) layer sits ABOVE provinces in the source
        // SVG, which hides our sea fill. Move provinces to the top so the
        // base map sits over the texture; the labels/SC stars layers are
        // re-appended afterward so they end up on top of the provinces.
        if (parchment) {
            svg.appendChild(prov);
            ['#supply-centers', '#province-centers', '#g1374', '#highlights',
             '#foreground', '#names', '#units', '#orders'].forEach(sel => {
                const n = svg.querySelector(sel);
                if (n) svg.appendChild(n);
            });
        }
    }
    const labelFill = parchment ? '#3c2e1e' : '#e8edf4';
    svg.querySelectorAll('#names text, #foreground text').forEach(t => {
        t.style.setProperty('fill', labelFill, 'important');
        t.style.setProperty('stroke', 'none', 'important');
        t.style.setProperty('font-weight', '500', 'important');
        t.style.setProperty('paint-order', 'stroke', 'important');
    });
    // Strip the SVG document title ("background"/"diplomacy map") so hovers
    // never fall back to a root tooltip. Each province and unit gets its own.
    svg.querySelectorAll(':scope > title, :scope > desc').forEach(n => n.remove());
    // Decorative SC stars / foreground markers should not intercept the mouse,
    // so hovers fall through to the underlying province polygon (with its
    // own tooltip).
    ['#foreground', '#g1374', '#supply-centers', '#province-centers', '#highlights', '#names']
        .forEach(sel => {
            const n = svg.querySelector(sel);
            if (n) n.style.setProperty('pointer-events', 'none', 'important');
        });
}

function baseRecolorMap(svg) {
    const parchment = document.body.classList.contains('theme-parchment');
    const seaFill = getSeaFill();
    const landFill = getLandFill();
    const stroke = getMapStroke();
    KNOWN_PROVINCES.forEach(abbr => {
        const node = selectProvince(svg, abbr);
        if (!node) return;
        const isSea = SEA_PROVINCES.has(abbr);
        if (parchment) {
            // Land stays transparent so the paper texture shows through. Sea
            // gets a cream wash to hide whatever dark fill the SVG had baked in.
            if (isSea) {
                node.style.setProperty('fill', seaFill, 'important');
                node.style.setProperty('fill-opacity', '1', 'important');
            } else {
                node.style.setProperty('fill-opacity', '0', 'important');
            }
        } else {
            node.style.setProperty('fill', isSea ? seaFill : landFill, 'important');
        }
        node.style.setProperty('stroke', stroke, 'important');
        node.style.setProperty('stroke-width', '0.75', 'important');
    });
}

const SEA_PROVINCES = new Set([
    'NAO','NWG','BAR','NTH','SKA','HEL','BAL','BOT','IRI','ENG',
    'MAO','WES','GOL','TYS','ION','ADR','AEG','EAS','BLA',
]);
const KNOWN_PROVINCES = [
    'NAO','NWG','BAR','NTH','SKA','HEL','BAL','BOT','IRI','ENG',
    'MAO','WES','GOL','TYS','ION','ADR','AEG','EAS','BLA',
    'CLY','EDI','YOR','LVP','WAL','LON',
    'NWY','SWE','FIN','STP','DEN',
    'HOL','BEL','PIC','BRE','PAR','BUR','GAS','MAR','SPA','POR','NAF','TUN',
    'KIE','RUH','MUN','BER','PRU','SIL','BOH',
    'LVN','MOS','WAR','UKR','SEV','ARM',
    'GAL','VIE','TYR','BUD','TRI',
    'PIE','VEN','TUS','ROM','APU','NAP',
    'SER','RUM','BUL','ALB','GRE',
    'CON','ANK','SMY','SYR',
];

function drawUnits(svg, units, dislodged) {
    units.forEach(unit => {
        const path = selectProvince(svg, unit.location);
        if (!path) return;
        let bbox;
        try { bbox = path.getBBox(); } catch { return; }
        const cx = bbox.x + bbox.width / 2;
        const cy = bbox.y + bbox.height / 2;

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', `unit-marker ${dislodged ? 'dislodged' : ''}`);
        if (unit.id) {
            group.setAttribute('data-unit-id', unit.id);
            group.style.cursor = 'pointer';
            group.addEventListener('click', (e) => {
                e.stopPropagation();
                showUnitHistory(unit.id);
            });
        }

        const bg = document.createElementNS('http://www.w3.org/2000/svg', unit.type === 'Fleet' ? 'rect' : 'circle');
        if (unit.type === 'Fleet') {
            bg.setAttribute('x', cx - 14);
            bg.setAttribute('y', cy - 10);
            bg.setAttribute('width', 28);
            bg.setAttribute('height', 20);
            bg.setAttribute('rx', 4);
        } else {
            bg.setAttribute('cx', cx);
            bg.setAttribute('cy', cy);
            bg.setAttribute('r', 13);
        }
        bg.setAttribute('fill', getPowerColor(unit.power) || '#888');
        bg.setAttribute('stroke', dislodged ? '#ff6b6b' : getCssVar('--unit-stroke') || '#0b0f19');
        bg.setAttribute('stroke-width', '2');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', cx);
        text.setAttribute('y', cy + 4);
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

// Province code → full name for tooltips. Sourced from data/map_layout.json.
const PROVINCE_NAMES = {
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
    CON: 'Constantinople', ANK: 'Ankara', SMY: 'Smyrna', SYR: 'Syria',
};

function showUnitHistory(unitId) {
    const reg = (gameState?.units_registry) || {};
    const unit = reg[unitId];
    const modal = document.getElementById('unit-history-modal');
    if (!unit) return;
    const dissolved = unit.dissolved_at
        ? `<div class="unit-modal-status dissolved">Dissolved at ${escapeHtml(unit.dissolved_at)}: ${escapeHtml(unit.dissolved_reason || '—')}</div>`
        : `<div class="unit-modal-status active">Currently at ${escapeHtml(PROVINCE_NAMES[unit.current_location] || unit.current_location)}</div>`;
    const rows = (unit.history || []).map(h => {
        const k = h.kind;
        let detail = '';
        if (k === 'born') detail = `built at ${PROVINCE_NAMES[h.location] || h.location}`;
        else if (k === 'ordered') detail = `<code>${escapeHtml(h.order)}</code>`;
        else if (k === 'moved') detail = `${PROVINCE_NAMES[h.from] || h.from} → ${PROVINCE_NAMES[h.to] || h.to}`;
        else if (k === 'held') detail = `held at ${PROVINCE_NAMES[h.location] || h.location}`;
        else if (k === 'dissolved') detail = `lost at ${PROVINCE_NAMES[h.from] || h.from}`;
        else detail = escapeHtml(JSON.stringify(h));
        return `<tr><td class="phase-cell">${escapeHtml(h.phase)}</td>
            <td class="kind-cell ${k}">${k}</td>
            <td>${detail}</td></tr>`;
    }).join('');
    modal.innerHTML = `
        <div class="modal-content unit-modal">
            <button class="modal-close" onclick="hideUnitHistory()">×</button>
            <h2><span class="unit-pip" style="background:var(--power-${unit.power.toLowerCase()})"></span>
                ${unit.type} (${unit.power})</h2>
            <div class="modal-sub">Born at ${PROVINCE_NAMES[unit.born_at_location] || unit.born_at_location}
                during ${escapeHtml(unit.born_at)}</div>
            ${dissolved}
            <table class="unit-history-table">
                <thead><tr><th>Phase</th><th>Event</th><th>Detail</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="3" class="muted">No actions yet.</td></tr>'}</tbody>
            </table>
        </div>
    `;
    modal.classList.remove('hidden');
}

function hideUnitHistory() {
    document.getElementById('unit-history-modal').classList.add('hidden');
}

function showAboutModal() {
    document.getElementById('about-modal').classList.remove('hidden');
}

function hideAboutModal() {
    document.getElementById('about-modal').classList.add('hidden');
}

function attachProvinceTooltips(svg) {
    svg.querySelectorAll('[id]').forEach(node => {
        if (!/^[a-z]{3}$/.test(node.id)) return;
        // Strip any existing inkscape labels so they don't shadow our title
        node.querySelectorAll(':scope > title').forEach(t => t.remove());
        const code = node.id.toUpperCase();
        const name = PROVINCE_NAMES[code] || code;
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${name} (${code})`;
        node.appendChild(title);
    });
}

function renderLegend() {
    const legend = document.getElementById('map-legend');
    legend.innerHTML = POWERS.map(p => {
        const power = (gameState.powers || {})[p] || { centers: 0 };
        return `<span class="legend-chip" data-power="${p}">
            <span class="dot" style="background:var(--power-${p.toLowerCase()})"></span>
            ${p} <em>${power.centers}</em>
        </span>`;
    }).join('');
}

// ---------- Tabs / Live feed ----------

function renderTabs() {
    const root = document.getElementById('feed-tabs');
    const items = [{ key: 'ALL', label: 'All' }, ...POWERS.map(p => ({ key: p, label: p.slice(0, 3) }))];
    root.innerHTML = items.map(it => {
        const isActive = it.key === activeTab;
        const colorStyle = it.key === 'ALL' ? '' : `--tab-color: var(--power-${it.key.toLowerCase()})`;
        const powerAttr = it.key !== 'ALL' ? `data-power="${it.key}"` : '';
        return `<button class="feed-tab ${isActive ? 'active' : ''}" data-tab="${it.key}" ${powerAttr}
            style="${colorStyle}" onclick="switchTab('${it.key}')">
                <span class="agent-dot"></span>${it.label}
            </button>`;
    }).join('');
    renderTabBody();
}

function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.feed-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    renderTabBody();
}

// Tracks which phase sections the user has flipped from their default state.
// Latest phase defaults to expanded, older phases default to collapsed; a
// flip is XOR'd against that default. Persisted to localStorage so toggles
// survive reloads.
const phaseToggle = new Set(JSON.parse(localStorage.getItem('phaseToggle') || '[]'));

function persistPhaseToggle() {
    localStorage.setItem('phaseToggle', JSON.stringify([...phaseToggle]));
}

function isPhaseExpanded(phaseLabel, isLatest) {
    const flipped = phaseToggle.has(phaseLabel);
    return isLatest ? !flipped : flipped;
}

function togglePhaseSection(phaseLabel) {
    if (phaseToggle.has(phaseLabel)) phaseToggle.delete(phaseLabel);
    else phaseToggle.add(phaseLabel);
    persistPhaseToggle();
    renderTabBody();
}

function renderEventsGrouped(events, renderFn) {
    // Ensure every event has a stable _id so per-card UI state (expand/collapse)
    // survives feed re-renders.
    for (const e of events) assignEventId(e);
    const groups = [];
    let current = { phase: 'Initialization', events: [] };
    for (const e of events) {
        if (e.kind === 'phase') {
            if (current.events.length) groups.push(current);
            current = { phase: e.label, events: [] };
            continue;
        }
        current.events.push(e);
    }
    if (current.events.length || !groups.length) groups.push(current);

    // Stitch `data-event-id` (and a conditional `expanded` class) onto each
    // rendered card so toggle state survives re-render.
    const decorateCard = (html, e) => {
        const id = e._id;
        const isExpanded = expandedEvents.has(String(id));
        return html.replace(
            /<div class="event /,
            `<div data-event-id="${id}" class="event${isExpanded ? ' expanded' : ''} `
        );
    };

    const COUNTABLE = new Set(['message','message_sent','message_received','thought','commitment','call','order','resolved']);
    return groups.map((g, idx) => {
        const isLatest = idx === groups.length - 1;
        const expanded = isPhaseExpanded(g.phase, isLatest);
        const count = g.events.filter(e => COUNTABLE.has(e.kind)).length;
        const body = expanded ? g.events.map(e => decorateCard(renderFn(e), e)).join('') : '';
        const key = g.phase.replace(/'/g, "\\'");
        return `<div class="phase-section ${expanded ? 'expanded' : 'collapsed'}">
            <div class="phase-section-header" onclick="togglePhaseSection('${key}')">
                <span class="phase-section-toggle">${expanded ? '▾' : '▸'}</span>
                <span class="phase-section-label">${escapeHtml(g.phase)}</span>
                <span class="phase-section-count">${count}</span>
            </div>
            <div class="phase-section-body">${body}</div>
        </div>`;
    }).join('');
}

function renderTabBody() {
    const container = document.getElementById('live-stream-container');
    const pane = document.getElementById('scratchpad-pane');
    const padBody = document.getElementById('scratchpad-body');
    const compact = document.getElementById('app-layout').classList.contains('layout-map');
    container.classList.toggle('compact-feed', compact);

    if (activeTab === 'ALL') {
        pane.classList.add('hidden');
        const events = tabs.ALL.events;
        if (!events.length && !gameState?.initialized) {
            container.innerHTML = '<div class="empty-state">System idle. Waiting to initialize.</div>';
            return;
        }
        if (!events.length) {
            container.innerHTML = '<div class="empty-state">No activity yet. Click an action to begin.</div>';
            return;
        }
        container.innerHTML = renderEventsGrouped(events, renderEventAll);
        container.scrollTop = container.scrollHeight;
        return;
    }

    // Per-power tab
    const tab = tabs[activeTab];
    const notes = tab.notes || [];
    if (notes.length) {
        pane.classList.remove('hidden');
        padBody.innerHTML = notes.map(n =>
            `<div class="note-row">
                <span class="note-phase">${escapeHtml(n.phase)}</span>
                <span class="note-text">${escapeHtml(n.text)}</span>
            </div>`
        ).join('');
    } else {
        pane.classList.add('hidden');
    }

    if (!tab.events.length) {
        container.innerHTML = `<div class="empty-state">No activity yet for ${activeTab}.</div>`;
        return;
    }
    container.innerHTML = renderEventsGrouped(tab.events, e => renderEventPower(e, activeTab));
    container.scrollTop = container.scrollHeight;
}

function colorFor(power) {
    return `var(--power-${(power || '').toLowerCase()})`;
}

function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderEventAll(e) {
    const kept = (k) => k === true ? '<span class="kept" title="kept">✓</span>'
        : k === false ? '<span class="broken" title="broken">✗</span>'
        : '<span class="unresolved" title="unresolved">◌</span>';
    if (e.kind === 'message') {
        return `<div class="event msg-event" onclick="toggleEventCard(this)">
            <span class="event-icon" title="letter">✉</span>
            <span class="event-tag" style="color:${colorFor(e.power)}">${e.power}</span>
            <span class="event-arrow">→</span>
            <span class="event-tag" style="color:${colorFor(e.to)}">${e.to}</span>
            <span class="round-tag">r${e.round + 1}</span>
            <span class="event-summary">${escapeHtml(e.content)}</span>
            <div class="event-body">${escapeHtml(e.content)}</div>
        </div>`;
    }
    if (e.kind === 'commitment') {
        const resolved = e.kept === undefined ? '' : kept(e.kept);
        return `<div class="event commit-event" onclick="toggleEventCard(this)">
            <span class="event-icon" title="commitment">❖</span>
            <span class="event-tag" style="color:${colorFor(e.power)}">${e.power}</span>
            <span class="commit-label">commits</span> ${resolved}
            <span class="event-summary">${escapeHtml(e.text)}</span>
            <div class="event-body">${escapeHtml(e.text)}</div>
        </div>`;
    }
    if (e.kind === 'order') {
        const acc = (e.accepted || []).map(o => `<li>${escapeHtml(o)}</li>`).join('');
        const rej = (e.rejected || []).map(r => `<li class="rejected">${escapeHtml(r.order)} — ${escapeHtml(r.error)}</li>`).join('');
        const nAcc = (e.accepted || []).length;
        const nRej = (e.rejected || []).length;
        const summary = `${nAcc} order${nAcc === 1 ? '' : 's'}${nRej ? ` · ${nRej} rejected` : ''}`;
        return `<div class="event order-event" onclick="toggleEventCard(this)">
            <span class="event-icon" title="orders">▤</span>
            <span class="event-tag" style="color:${colorFor(e.power)}">${e.power}</span>
            <span class="event-label">orders</span>
            <span class="event-summary">${summary}</span>
            <ul class="order-list">${acc}${rej}</ul>
        </div>`;
    }
    if (e.kind === 'phase') {
        return `<div class="phase-marker"><span>${e.label}</span></div>`;
    }
    if (e.kind === 'round_marker') {
        return `<div class="round-divider"><span>${escapeHtml(e.label)}</span></div>`;
    }
    if (e.kind === 'round_summary') {
        return renderRoundSummary(e);
    }
    if (e.kind === 'call') {
        return renderCall(e);
    }
    if (e.kind === 'resolved') {
        const caps = (e.sc_changes || []).map(c =>
            `<li><span class="sc-name">${c.center}</span>
              <span class="sc-from">${c.from || 'neutral'}</span> →
              <span style="color:${colorFor(c.to)}">${c.to}</span></li>`).join('');
        const nSc = (e.sc_changes || []).length;
        const summary = `${escapeHtml(e.previous_phase)} resolved · ${nSc} SC${nSc === 1 ? '' : 's'} changed`;
        return `<div class="event resolved-event" onclick="toggleEventCard(this)">
            <span class="event-icon" title="turn resolved">⚖</span>
            <strong>Turn resolved</strong>
            <span class="event-summary">${summary}</span>
            <div class="event-body">${escapeHtml(e.previous_phase)} → ${escapeHtml(e.current_phase)}</div>
            ${caps ? `<ul class="sc-changes">${caps}</ul>` : '<div class="muted">No SCs changed.</div>'}
        </div>`;
    }
    return '';
}

function renderEventPower(e, power) {
    const kept = (k) => k === true ? '<span class="kept" title="kept">✓</span>'
        : k === false ? '<span class="broken" title="broken">✗</span>'
        : '<span class="unresolved" title="unresolved">◌</span>';
    if (e.kind === 'thought') {
        return `<div class="event thought-event" onclick="toggleEventCard(this)">
            <span class="event-icon" title="thought">☁</span>
            <span class="event-summary">${escapeHtml(e.text)}</span>
            <div class="event-body thought">${escapeHtml(e.text)}</div>
        </div>`;
    }
    if (e.kind === 'message_sent') {
        return `<div class="event msg-event sent" onclick="toggleEventCard(this)">
            <span class="event-icon" title="letter sent">✉</span>
            <span class="event-arrow">→</span> to
            <span class="event-tag" style="color:${colorFor(e.to)}">${e.to}</span>
            <span class="round-tag">r${e.round + 1}</span>
            <span class="event-summary">${escapeHtml(e.content)}</span>
            <div class="event-body">${escapeHtml(e.content)}</div>
        </div>`;
    }
    if (e.kind === 'message_received') {
        return `<div class="event msg-event received" onclick="toggleEventCard(this)">
            <span class="event-icon" title="letter received">✉</span>
            <span class="event-arrow">←</span> from
            <span class="event-tag" style="color:${colorFor(e.from)}">${e.from}</span>
            <span class="round-tag">r${e.round + 1}</span>
            <span class="event-summary">${escapeHtml(e.content)}</span>
            <div class="event-body">${escapeHtml(e.content)}</div>
        </div>`;
    }
    if (e.kind === 'commitment') {
        const resolved = e.kept === undefined ? '' : kept(e.kept);
        return `<div class="event commit-event" onclick="toggleEventCard(this)">
            <span class="event-icon" title="commitment">❖</span>
            <span class="commit-label">commitment</span> ${resolved}
            <span class="event-summary">${escapeHtml(e.text)}</span>
            <div class="event-body">${escapeHtml(e.text)}</div>
        </div>`;
    }
    if (e.kind === 'order') {
        const acc = (e.accepted || []).map(o => `<li>${escapeHtml(o)}</li>`).join('');
        const rej = (e.rejected || []).map(r => `<li class="rejected">${escapeHtml(r.order)} — ${escapeHtml(r.error)}</li>`).join('');
        const nAcc = (e.accepted || []).length;
        const nRej = (e.rejected || []).length;
        const summary = `${nAcc} order${nAcc === 1 ? '' : 's'}${nRej ? ` · ${nRej} rejected` : ''}`;
        return `<div class="event order-event" onclick="toggleEventCard(this)">
            <span class="event-icon" title="orders">▤</span>
            <span class="event-label">orders submitted</span>
            <span class="event-summary">${summary}</span>
            <ul class="order-list">${acc}${rej}</ul>
        </div>`;
    }
    if (e.kind === 'phase') {
        return `<div class="phase-marker"><span>${e.label}</span></div>`;
    }
    if (e.kind === 'round_marker') {
        return `<div class="round-divider"><span>${escapeHtml(e.label)}</span></div>`;
    }
    if (e.kind === 'round_summary') {
        return renderRoundSummary(e);
    }
    if (e.kind === 'call') {
        return renderCall(e);
    }
    return '';
}

function renderRoundSummary(e) {
    const lines = (e.headlines || []).map(h => `<li>${escapeHtml(h)}</li>`).join('');
    const count = (e.headlines || []).length;
    const summary = `${count} event${count === 1 ? '' : 's'} this phase`;
    return `<div class="event round-summary-event" onclick="toggleEventCard(this)">
        <span class="event-icon" title="dispatch">📜</span>
        <strong>Dispatch · ${escapeHtml(e.phase || '')}</strong>
        <span class="event-summary">${summary}</span>
        <ul class="summary-headlines">${lines}</ul>
    </div>`;
}

const expandedEvents = new Set();

function toggleEventCard(el) {
    const container = document.getElementById('live-stream-container');
    if (!container || !container.classList.contains('compact-feed')) return;
    const id = el.dataset.eventId;
    if (!id) { el.classList.toggle('expanded'); return; }
    if (expandedEvents.has(id)) expandedEvents.delete(id);
    else expandedEvents.add(id);
    el.classList.toggle('expanded');
}

function renderCall(e) {
    const turns = (e.messages || []).map(m =>
        `<div class="call-turn">
            <span class="event-tag" style="color:${colorFor(m.from)}">${m.from}</span>
            <span class="call-msg">${escapeHtml(m.content)}</span>
        </div>`
    ).join('');
    const status = e.ended
        ? `<span class="call-status ended">ended</span>`
        : `<span class="call-status live">live</span>`;
    const endReason = e.ended && e.endReason
        ? `<div class="call-end-reason"><span class="call-end-label">End reason:</span> ${escapeHtml(e.endReason)}</div>`
        : '';
    const nTurns = (e.messages || []).length;
    const summary = `${escapeHtml(e.topic || 'call')} · ${nTurns} turn${nTurns === 1 ? '' : 's'}${e.ended ? '' : ' · live'}`;
    return `<div class="event call-event" onclick="toggleEventCard(this)">
        <span class="event-icon" title="call">☎</span>
        <span class="event-tag" style="color:${colorFor(e.initiator)}">${e.initiator}</span>
        <span class="event-arrow">⇆</span>
        <span class="event-tag" style="color:${colorFor(e.recipient)}">${e.recipient}</span>
        <span class="round-tag">r${(e.round || 0) + 1}</span>
        <span class="call-status-inline">${status}</span>
        <span class="event-summary">${summary}</span>
        <div class="call-topic">${escapeHtml(e.topic)}</div>
        <div class="call-thread">${turns || '<div class="muted">…</div>'}</div>
        ${endReason}
    </div>`;
}

// ---------- WebSocket ----------

function connectWebSocket() {
    ws = new WebSocket(`${WS}/ws/game`);
    ws.onmessage = (evt) => {
        let data;
        try { data = JSON.parse(evt.data); } catch { return; }
        handleEvent(data);
    };
    ws.onclose = () => setTimeout(connectWebSocket, 1000);
}

function handleEvent(data) {
    switch (data.type) {
        case 'reset': return clearFeed();
        case 'phase_start': return onPhaseStart(data);
        case 'phase_end': return clearAllActive();
        case 'negotiation_round': return onNegotiationRound(data);
        case 'stream': return onStreamChunk(data);
        case 'thought': return onThought(data);
        case 'note_saved': return onNoteSaved(data);
        case 'message': return onMessage(data);
        case 'commitment': return onCommitment(data);
        case 'orders_set': return onOrdersSet(data);
        case 'adjudicated': return onAdjudicated(data);
        case 'agent_error': return onAgentError(data);
        case 'call_started': return onCallStarted(data);
        case 'call_message': return onCallMessage(data);
        case 'call_ended': return onCallEnded(data);
        case 'game_started': return;
    }
}

function clearFeed() {
    Object.keys(tabs).forEach(k => {
        if (k === 'ALL') tabs[k] = { events: [] };
        else tabs[k] = { notes: [], events: [] };
    });
    renderTabBody();
}

let _eventIdCounter = 0;
function assignEventId(event) {
    if (event._id === undefined) event._id = ++_eventIdCounter;
    return event;
}
function pushAll(event) {
    tabs.ALL.events.push(assignEventId(event));
}
function pushPower(power, event) {
    if (!tabs[power]) return;
    tabs[power].events.push(assignEventId(event));
}

function onPhaseStart(data) {
    const label = data.phase === 'negotiate' ? 'Negotiations' : 'Orders';
    const phase = `${label} · ${gameState?.turn?.season || ''} ${gameState?.turn?.year || ''}`;
    pushAll({ kind: 'phase', label: phase });
    POWERS.forEach(p => pushPower(p, { kind: 'phase', label: phase }));
    refreshIfVisible();
}

function onNegotiationRound(data) {
    const ind = document.getElementById('round-indicator');
    ind.textContent = `Round ${data.round + 1} / ${data.total}`;
    ind.classList.remove('hidden');
    const label = `Round ${data.round + 1} of ${data.total}`;
    pushAll({ kind: 'round_marker', label });
    POWERS.forEach(p => pushPower(p, { kind: 'round_marker', label }));
    refreshIfVisible();
}

function onStreamChunk(data) {
    // Track that this power is mid-flight; we don't render the raw stream
    // because the final `thought`/`scratchpad`/`message` events arrive cleanly.
    activity[data.power] = { channel: data.channel, lastChunkAt: Date.now() };
    markActive(data.power, true);
}

function onThought(data) {
    pushPower(data.power, {
        kind: 'thought',
        phase: data.phase,
        text: data.text,
    });
    delete activity[data.power];
    markActive(data.power, false);
    refreshIfVisible(data.power);
}

// Update DOM markers showing which agents are currently generating.
function markActive(power, active) {
    document.querySelectorAll(`[data-power="${power}"]`).forEach(el => {
        el.classList.toggle('agent-active', active);
    });
    // Update the header "thinking" chip
    const count = Object.keys(activity).length;
    const chip = document.getElementById('thinking-chip');
    if (!chip) return;
    if (count > 0) {
        chip.textContent = `${count} thinking…`;
        chip.classList.remove('hidden');
    } else {
        chip.classList.add('hidden');
    }
}

function onNoteSaved(data) {
    if (tabs[data.power]) {
        tabs[data.power].notes.push({
            phase: gameState?.turn ? `${gameState.turn.season.slice(0,3).toUpperCase()}${gameState.turn.year}` : '?',
            text: data.text,
        });
        // Rough soft cap on the client too — match the server-side budget
        while (tabs[data.power].notes.reduce((sum, n) => sum + n.text.length, 0) > 4000
               && tabs[data.power].notes.length > 1) {
            tabs[data.power].notes.shift();
        }
    }
    // Treat as "this agent finished generating"
    delete activity[data.power];
    markActive(data.power, false);
    refreshIfVisible(data.power);
}

function onMessage(data) {
    // Sender perspective
    pushPower(data.from, {
        kind: 'message_sent',
        to: data.to,
        content: data.content,
        round: data.round,
    });
    // Receiver perspective
    pushPower(data.to, {
        kind: 'message_received',
        from: data.from,
        content: data.content,
        round: data.round,
    });
    // Spectator "all" view
    pushAll({
        kind: 'message',
        power: data.from,
        to: data.to,
        content: data.content,
        round: data.round,
    });
    refreshIfVisible();
}

function onCommitment(data) {
    const event = {
        kind: 'commitment',
        power: data.power,
        text: data.text,
        type: data.type,
        target: data.target,
        kept: undefined,
    };
    pushPower(data.power, event);
    pushAll(event);
    refreshIfVisible(data.power);
}

function onOrdersSet(data) {
    const event = {
        kind: 'order',
        power: data.power,
        accepted: data.accepted || [],
        rejected: data.rejected || [],
    };
    pushPower(data.power, event);
    pushAll(event);
    refreshIfVisible(data.power);
}

function onAdjudicated(data) {
    // Mark commitments kept/broken in existing events
    (data.resolved_commitments || []).forEach(c => {
        for (const tab of [tabs.ALL, tabs[c.power]]) {
            if (!tab) continue;
            for (const ev of tab.events) {
                if (ev.kind === 'commitment' && ev.power === c.power && ev.text === c.text && ev.kept === undefined) {
                    ev.kept = c.kept;
                }
            }
        }
    });
    pushAll({
        kind: 'resolved',
        previous_phase: data.previous_phase,
        current_phase: data.current_phase,
        sc_changes: data.sc_changes || [],
    });
    if ((data.round_summary || []).length) {
        pushAll({
            kind: 'round_summary',
            phase: data.previous_phase,
            headlines: data.round_summary,
        });
    }
    document.getElementById('round-indicator').classList.add('hidden');
    refreshIfVisible();
}

function onAgentError(data) {
    pushAll({ kind: 'phase', label: `⚠ ${data.power}: ${data.error}` });
    if (data.power && data.power !== '?') {
        delete activity[data.power];
        markActive(data.power, false);
    }
    refreshIfVisible();
}

function clearAllActive() {
    POWERS.forEach(p => {
        delete activity[p];
        markActive(p, false);
    });
}

// Track live call rendering: when a call starts we push a single event into
// the relevant tabs and update it as messages arrive.
const liveCalls = {}; // call_id -> { event, tabsTouched: Set }

function onCallStarted(data) {
    const ev = {
        kind: 'call',
        callId: data.id,
        initiator: data.initiator,
        recipient: data.recipient,
        topic: data.topic,
        round: data.round,
        messages: [],
        ended: false,
        endReason: null,
    };
    liveCalls[data.id] = ev;
    pushAll(ev);
    pushPower(data.initiator, ev);
    pushPower(data.recipient, ev);
    refreshIfVisible();
}

function onCallMessage(data) {
    const ev = liveCalls[data.call_id];
    if (!ev) return;
    ev.messages.push({ from: data.from, content: data.content });
    refreshIfVisible();
}

function onCallEnded(data) {
    const ev = liveCalls[data.call_id];
    if (!ev) return;
    ev.ended = true;
    ev.endReason = data.end_reason;
    delete liveCalls[data.call_id];
    refreshIfVisible();
}

function refreshIfVisible(power) {
    if (!power || activeTab === 'ALL' || activeTab === power) {
        renderTabBody();
    }
}

// ---------- Scratchpad pane toggle ----------

function toggleScratchpad() {
    const body = document.getElementById('scratchpad-body');
    const toggle = document.getElementById('scratchpad-toggle');
    if (body.style.display === 'none') {
        body.style.display = '';
        toggle.textContent = '▾';
    } else {
        body.style.display = 'none';
        toggle.textContent = '▸';
    }
}

// ---------- Setup modal ----------

function showSetupModal() {
    const root = document.getElementById('power-configs');
    const modelOpts = MODEL_OPTIONS.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
    const policyOpts = Object.entries(policies).map(([key, p]) =>
        `<option value="${key}" title="${escapeHtml(p.summary)}">${p.label}</option>`).join('');
    root.innerHTML = '';
    POWERS.forEach(power => {
        root.insertAdjacentHTML('beforeend', `
            <div class="config-row">
                <span class="config-power" style="color:var(--power-${power.toLowerCase()})">${power}</span>
                <select id="provider-${power}">${modelOpts}</select>
                <select id="policy-${power}">${policyOpts}</select>
            </div>
        `);
    });
    document.getElementById('setup-modal').classList.remove('hidden');
}

function hideSetupModal() {
    document.getElementById('setup-modal').classList.add('hidden');
}

async function startGame() {
    const config = { agents_config: {} };
    POWERS.forEach(power => {
        config.agents_config[power] = {
            provider: document.getElementById(`provider-${power}`).value,
            policy: document.getElementById(`policy-${power}`).value,
        };
    });
    try {
        setButton('Initializing…', true);
        await fetch(`${API}/api/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
        });
        hideSetupModal();
        clearFeed();
        await loadGameState();
        phaseStep = 1;
        syncActionButton();
    } catch (e) {
        console.error(e);
        phaseStep = 0;
        setButton('Initialize Game', false);
    }
}

async function resetGame() {
    if (!confirm('Reset and abandon current game?')) return;
    await fetch(`${API}/api/reset`, { method: 'POST' });
    clearFeed();
    await loadGameState();
    phaseStep = 0;
    syncActionButton();
}

// ---------- Phase actions ----------

async function runNegotiations() {
    setButton('Agents negotiating…', true);
    phaseStep = 2;
    try {
        await fetch(`${API}/api/phase/negotiate`, { method: 'POST' });
        await loadGameState();
        phaseStep = 3;
        syncActionButton();
    } catch (e) {
        phaseStep = 1;
        syncActionButton();
    }
}

async function runOrders() {
    setButton('Agents submitting orders…', true);
    phaseStep = 4;
    try {
        await fetch(`${API}/api/phase/orders`, { method: 'POST' });
        await loadGameState();
        phaseStep = 5;
        syncActionButton();
    } catch (e) {
        phaseStep = 3;
        syncActionButton();
    }
}

async function runAdjudicate() {
    setButton('Resolving…', true);
    phaseStep = 6;
    try {
        await fetch(`${API}/api/phase/adjudicate`, { method: 'POST' });
        await loadGameState();
        phaseStep = gameState.turn.type === 'M' ? 1 : 3;
        syncActionButton();
    } catch (e) {
        phaseStep = 5;
        syncActionButton();
    }
}

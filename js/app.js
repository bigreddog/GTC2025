
function escapeHtml(unsafe) {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

const state = {
    entrants: [],
    results: [],
    checkpoints: [],
    selectedEntrants: [],
    colors: ['#e74c3c', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#34495e', '#7f8c8d', '#2c3e50', '#8e44ad', '#d35400', '#27ae60']
};

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupEventListeners();
});

async function loadData() {
    try {
        const [iscrittiRes, classificheRes, checkpointsRes] = await Promise.all([
            fetch('data/iscritti_1133.json'),
            fetch('data/classifiche_1133.json'),
            fetch('data/checkpoints.json')
        ]);

        const iscrittiData = await iscrittiRes.json();
        const classificheData = await classificheRes.json();

        state.entrants = iscrittiData.iscritti || [];
        state.results = classificheData[0].result || [];
        state.checkpoints = await checkpointsRes.json();

        // Match results to entrants
        const resultsMap = new Map();
        state.results.forEach(r => resultsMap.set(r.bib, r));

        state.entrants = state.entrants.filter(e => resultsMap.has(Number(e.pettorale))).map(e => ({
            ...e,
            result: resultsMap.get(Number(e.pettorale))
        }));

    } catch (err) {
        console.error("Error loading data:", err);
        alert("Failed to load race data.");
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const compareBtn = document.getElementById('compare-btn');
    const clearBtn = document.getElementById('clear-btn');

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        if (term.length < 2) {
            searchResults.style.display = 'none';
            return;
        }

        const matches = state.entrants.filter(entrant => {
            const fullName = `${entrant.nome} ${entrant.cognome}`.toLowerCase();
            const bib = String(entrant.pettorale);
            return fullName.includes(term) || bib.includes(term);
        }).slice(0, 10);

        if (matches.length > 0) {
            searchResults.innerHTML = matches.map(m => `
                <div class="dropdown-item" data-bib="${m.pettorale}">
                    ${m.nome} ${m.cognome} (Bib: ${m.pettorale})
                </div>
            `).join('');
            searchResults.style.display = 'block';
        } else {
            searchResults.innerHTML = '<div class="dropdown-item">No matches found</div>';
            searchResults.style.display = 'block';
        }
    });

    searchResults.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item && item.dataset.bib) {
            const bib = item.dataset.bib;
            const entrant = state.entrants.find(en => String(en.pettorale) === bib);
            if (entrant && !state.selectedEntrants.find(se => se.pettorale === entrant.pettorale)) {
                state.selectedEntrants.push(entrant);
                updateSelectedUI();
            }
            searchInput.value = '';
            searchResults.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResults.style.display = 'none';
        }
    });

    compareBtn.addEventListener('click', () => {
        renderVisualizations();
    });

    clearBtn.addEventListener('click', () => {
        state.selectedEntrants = [];
        updateSelectedUI();
        document.getElementById('visualization-section').classList.add('hidden');
        document.getElementById('details-section').classList.add('hidden');
    });
}

function updateSelectedUI() {
    const list = document.getElementById('selected-entrants-list');
    const btn = document.getElementById('compare-btn');

    list.innerHTML = state.selectedEntrants.map(se => `
        <li class="selected-entrant">
            ${se.nome} ${se.cognome} (${se.pettorale})
            <button class="remove-btn" onclick="removeEntrant('${se.pettorale}')">&times;</button>
        </li>
    `).join('');

    btn.disabled = state.selectedEntrants.length === 0;
}

window.removeEntrant = function(bib) {
    state.selectedEntrants = state.selectedEntrants.filter(se => String(se.pettorale) !== String(bib));
    updateSelectedUI();
};

function parseTime(timeStr) {
    if (!timeStr) return null;
    return new Date(timeStr).getTime();
}

function calculateSegments(entrant) {
    if (!entrant.result || !entrant.result.crono) return [];

    const crono = entrant.result.crono.sort((a, b) => a.postazione - b.postazione);
    const segments = [];
    let previousTime = null;

    // Checkpoints ordered logic
    const cps = state.checkpoints.sort((a,b) => a.id - b.id);

    // Assume start time is the first checkpoint (Start)
    const firstCp = crono.find(c => c.postazione === cps[0].id);
    let startTime = null;

    if (firstCp && firstCp.tempo) {
        startTime = parseTime(firstCp.tempo);
        previousTime = startTime;
    }

    for (let i = 0; i < crono.length; i++) {
        const cpData = crono[i];
        if (cpData.postazione === cps[0].id) continue; // Skip start as segment since it has 0 duration

        const cpDef = cps.find(c => c.id === cpData.postazione);
        if (!cpDef) continue;

        const currTime = parseTime(cpData.tempo);
        if (!currTime) continue;

        if (previousTime) {
            const diffMs = currTime - previousTime;
            segments.push({
                checkpointId: cpData.postazione,
                name: cpDef.name,
                durationMs: diffMs,
                endTime: currTime
            });
        }
        previousTime = currTime;
    }
    return segments;
}

function formatDuration(ms) {
    if (ms < 0) return '0m';
    const totalMins = Math.floor(ms / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hours}h ${mins}m`;
}

function renderVisualizations() {
    if (state.selectedEntrants.length === 0) return;

    const chartSection = document.getElementById('visualization-section');
    const detailsSection = document.getElementById('details-section');
    const chart = document.getElementById('chart');
    const legend = document.getElementById('chart-legend');

    chartSection.classList.remove('hidden');
    detailsSection.classList.remove('hidden');

    const entrantData = state.selectedEntrants.map(e => ({
        entrant: e,
        segments: calculateSegments(e)
    }));

    let maxTotalTimeMs = 0;
    entrantData.forEach(d => {
        const total = d.segments.reduce((sum, seg) => sum + seg.durationMs, 0);
        if (total > maxTotalTimeMs) maxTotalTimeMs = total;
    });

    const allCpIds = new Set();
    entrantData.forEach(d => d.segments.forEach(seg => allCpIds.add(seg.checkpointId)));
    const activeCheckpoints = state.checkpoints.filter(cp => allCpIds.has(cp.id));

    legend.innerHTML = activeCheckpoints.map((cp, idx) => `
        <div class="legend-item">
            <div class="legend-color" style="background-color: ${state.colors[idx % state.colors.length]}"></div>
            <span>${cp.name}</span>
        </div>
    `).join('');

    chart.innerHTML = entrantData.map(d => {
        const name = `${d.entrant.nome} ${d.entrant.cognome}`;
        const totalDuration = d.segments.reduce((sum, seg) => sum + seg.durationMs, 0);
        const formatTotal = formatDuration(totalDuration);

        const segmentsHtml = d.segments.map(seg => {
            const widthPct = maxTotalTimeMs > 0 ? (seg.durationMs / maxTotalTimeMs) * 100 : 0;
            const colorIdx = activeCheckpoints.findIndex(cp => cp.id === seg.checkpointId);
            const color = state.colors[colorIdx % state.colors.length];
            return `
                <div class="chart-segment"
                     style="width: ${widthPct}%; background-color: ${color};"
                     title="${escapeHtml(name)} -> ${seg.name}: ${formatDuration(seg.durationMs)}">
                </div>
            `;
        }).join('');

        return `
            <div class="chart-row">
                <div class="chart-label" title="${escapeHtml(name)} (${formatTotal})">
                    ${name}
                    <div style="font-size:0.8em; font-weight:normal; color:#666;">${formatTotal}</div>
                </div>
                <div class="chart-bar-container">
                    ${segmentsHtml}
                </div>
            </div>
        `;
    }).join('');

    renderTable(entrantData, activeCheckpoints);
}

function renderTable(entrantData, activeCheckpoints) {
    const container = document.getElementById('table-container');

    let html = `<table><thead><tr><th>Entrant</th>`;
    activeCheckpoints.forEach(cp => {
        html += `<th>To ${cp.name}</th>`;
    });
    html += `<th>Total Recorded</th></tr></thead><tbody>`;

    entrantData.forEach(d => {
        html += `<tr><td><strong>${d.entrant.nome} ${d.entrant.cognome}</strong><br><small>Bib: ${d.entrant.pettorale}</small></td>`;
        let totalMs = 0;

        activeCheckpoints.forEach(cp => {
            const seg = d.segments.find(s => s.checkpointId === cp.id);
            if (seg) {
                totalMs += seg.durationMs;
                html += `<td>${formatDuration(seg.durationMs)}</td>`;
            } else {
                html += `<td style="color:#aaa;">-</td>`;
            }
        });

        html += `<td><strong>${formatDuration(totalMs)}</strong></td></tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

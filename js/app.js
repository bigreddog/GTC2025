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
    checkpoints: [],
    processedData: []
};

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    processAndRender();
    setupSearch();
});

async function loadData() {
    try {
        const [iscrittiRes, classificheRes, checkpointsRes] = await Promise.all([
            fetch('data/iscritti_931.json'),
            fetch('data/931.json'),
            fetch('data/checkpoints.json')
        ]);

        const iscrittiData = await iscrittiRes.json();
        const classificheData = await classificheRes.json();

        let entrants = iscrittiData.iscritti || [];
        const results = classificheData[0].result || [];
        state.checkpoints = await checkpointsRes.json();

        const resultsMap = new Map();
        results.forEach(r => resultsMap.set(r.bib, r));

        // Keep all entrants, attach results if they exist
        state.entrants = entrants.map(e => ({
            ...e,
            result: resultsMap.get(Number(e.pettorale)) || null
        }));

    } catch (err) {
        console.error("Error loading data:", err);
        alert("Failed to load race data.");
    }
}

function parseTime(timeStr) {
    if (!timeStr) return null;
    return new Date(timeStr).getTime();
}

function calculateSegments(entrant) {
    if (!entrant.result || !entrant.result.crono) return [];

    const crono = entrant.result.crono.sort((a, b) => a.postazione - b.postazione);
    const segments = [];
    let previousTime = null;

    const cps = state.checkpoints.sort((a,b) => a.id - b.id);

    // Official Gun Time for the race start is 2025-07-11T20:00:00+00:00
    // This is used instead of the runner's pre-start corral scan time.
    let startTime = parseTime("2025-07-11T20:00:00+00:00");
    previousTime = startTime;

    for (let i = 0; i < crono.length; i++) {
        const cpData = crono[i];
        if (cpData.postazione === cps[0].id) continue;

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
    if (ms < 0) return '00:00:00';
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function processAndRender() {
    state.processedData = state.entrants.map(e => {
        const segments = calculateSegments(e);
        const totalDurationMs = segments.reduce((sum, seg) => sum + seg.durationMs, 0);
        return {
            entrant: e,
            segments: segments,
            totalDurationMs: totalDurationMs
        };
    });

    // Sort logic: fastest (posizione 1, 2, 3...) at the top.
    // If no posizione, put them at the bottom.
    state.processedData.sort((a, b) => {
        const posA = (a.entrant.result && a.entrant.result.posizione) ? a.entrant.result.posizione : 999999;
        const posB = (b.entrant.result && b.entrant.result.posizione) ? b.entrant.result.posizione : 999999;
        return posA - posB;
    });

    renderTable(state.processedData);
}

function renderTable(data) {
    const container = document.getElementById('table-container');

    // Determine active checkpoints for headers based on all data
    const cps = state.checkpoints.sort((a,b) => a.id - b.id);
    // Remove the Start point (id 1) from columns since it has 0 duration
    const displayCheckpoints = cps.filter(cp => cp.id !== 1);

    let html = `<table><thead><tr><th>Pos</th><th>Entrant</th>`;
    displayCheckpoints.forEach(cp => {
        html += `<th>To ${escapeHtml(cp.name)}</th>`;
    });
    html += `<th>Total Time</th></tr></thead><tbody id="table-body">`;

    data.forEach(d => {
        const name = `${d.entrant.nome} ${d.entrant.cognome}`;
        const pos = (d.entrant.result && d.entrant.result.posizione) ? d.entrant.result.posizione : '-';
        html += `<tr class="entrant-row" data-search="${escapeHtml(name.toLowerCase())} ${d.entrant.pettorale}">
            <td>${pos}</td>
            <td><strong>${escapeHtml(name)}</strong><br><small>Bib: ${escapeHtml(d.entrant.pettorale)}</small></td>`;

        let totalMs = 0;
        displayCheckpoints.forEach(cp => {
            const seg = d.segments.find(s => s.checkpointId === cp.id);
            if (seg) {
                totalMs += seg.durationMs;
                html += `<td>${formatDuration(seg.durationMs)}</td>`;
            } else {
                html += `<td style="color:#aaa;">-</td>`;
            }
        });

        const officialTotal = totalMs > 0 ? formatDuration(totalMs) : '-';
        html += `<td><strong>${officialTotal}</strong></td></tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        const rows = document.querySelectorAll('.entrant-row');

        rows.forEach(row => {
            if (term === '' || row.dataset.search.includes(term)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });
}

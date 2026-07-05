# Gran Trail Courmayeur (GTC) Explorer Dashboard

## Product Requirements Document (PRD) & Maintainer Guide

### 1. Overview
The GTC Explorer Dashboard is a lightweight, vanilla HTML/CSS/JavaScript web application designed to allow users to explore and analyze race results. It visualizes the progress of entrants across multiple checkpoints, allowing users to filter by name or bib, and sort by finishing position (fastest first).

### 2. Core Features
*   **Data Parsing:** Fetches static JSON datasets representing race entrants, race results (including chronological checkpoint scans), and checkpoint definitions.
*   **Segment Calculation:** Calculates the time elapsed (duration) between the official gun start time and each successive checkpoint.
*   **Tabular View:** Renders all entrants and their segment times in a responsive HTML table.
*   **Filtering:** Provides an instant text-based filter to search for runners by name, surname, or bib.
*   **Sorting:** Orders entrants primarily by official ranking position (`posizione`).

### 3. Technical Stack
*   **Frontend:** Vanilla HTML5, CSS3, ES6 JavaScript.
*   **No Build Step:** The application runs directly in the browser and requires no compilation step (e.g., Node.js, Webpack, etc.), meaning it can be served using any basic static file server (like `http-server`).
*   **Data Format:** The application expects data in the format provided by the BeebeeBoard API (commonly used by Tor des Geants/Torxtrail races).

---

### 4. Updating for a Future Race (Maintenance Guide)

If you need to update the application to track a different race (e.g., GTC 100 2026 or Tor des Geants), follow these exact steps to ensure the logic and UI match the new race parameters.

#### Step A: Acquire the New Data Files
You will need three key files from the race API. They are typically named according to the race ID (e.g., `931` or `1133`).
1.  **Entrants Data:** Usually `iscritti_<ID>.json`. Contains participant info (name, bib, nationality).
2.  **Results Data:** Usually `<ID>.json` or `classifiche_<ID>.json`. Contains the actual finish times and arrays of checkpoint scan times (`crono`).
3.  **Checkpoint Data:** Usually `avanzati_<ID>.json`. Contains the race layout (`postazioni`).

*Place these files directly into the `data/` directory at the root of the project.*

#### Step B: Generate the `checkpoints.json` File
The app expects a simplified `checkpoints.json` file. You can generate this by parsing the `avanzati` file.
You can run a script like this (using Node.js) in the project root:
```javascript
const fs = require('fs');
const avanzati = JSON.parse(fs.readFileSync('data/avanzati_<NEW_ID>.json', 'utf8'));
const checkpoints = avanzati.postazioni.map(p => ({
    id: p.rank,
    name: p.text,
    distance: p.distanza,
    elevation: p.dislivello
}));
fs.writeFileSync('data/checkpoints.json', JSON.stringify(checkpoints, null, 2));
```

#### Step C: Update Data Paths in `js/app.js`
Open `js/app.js` and locate the `loadData()` function. Update the fetch URLs to point to your new JSON files:
```javascript
const [iscrittiRes, classificheRes, checkpointsRes] = await Promise.all([
    fetch('data/iscritti_<NEW_ID>.json'), // Update this line
    fetch('data/<NEW_ID>.json'),          // Update this line
    fetch('data/checkpoints.json')
]);
```

#### Step D: Update the Official Gun Time in `js/app.js`
In `js/app.js`, locate the `calculateSegments()` function.
Crucially, you must update the hardcoded **Official Gun Time** (`startTime`). The application uses this timestamp instead of the individual runner's corral scan time to calculate official segment durations.
Find this line and replace the date string with the exact UTC start time of the new race:
```javascript
// Example: If the new race starts on Sept 10, 2026 at 10:00:00 AM UTC
let startTime = parseTime("2026-09-10T10:00:00+00:00");
```

#### Step E: Update `index.html` Title and Headers
Open `index.html` and update the `<title>` and `<h1>` tags to reflect the new race name, year, and distance.
```html
<title>Gran Trail Courmayeur 2026 - Results</title>
<!-- ... -->
<h1>Gran Trail Courmayeur 2026 (100km) - Results</h1>
```

#### Step F: Clean Up
Remove the old JSON files from the `data/` directory to prevent repository bloat. Serve the site locally and verify that the first runner's total time in the table matches the official race tracker times exactly.

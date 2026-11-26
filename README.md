# Air Monitor v7 — administrative polygons and own location

Frontend update to the v6 site. Deploy all files in this directory to the root of your existing GitHub Pages repository. The API URL remains `https://ittusovkaeuserver.herokuapp.com/api/alerts`. The v5 Python API is unchanged. No extra alert services or credentials.

## Boundary data

Source: [Astaryon/UA_geojson](https://github.com/Astaryon/UA_geojson), based on 2020 administrative geography; credit to the upstream authors and Федір Гонца. The project states that its data is under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/. Boundaries are administrative, not a map of military objects or territorial control.

The app first requests `data/regiony.geojson` and `data/rayony.geojson` from the Pages repository, then tries the original raw GitHub URLs. The raw files could not be downloaded in the build environment, so are NOT included. For reliable hosting, download them in PowerShell from the project root:

```powershell
New-Item -ItemType Directory -Force data | Out-Null
Invoke-WebRequest 'https://raw.githubusercontent.com/Astaryon/UA_geojson/main/regiony.geojson' -OutFile 'data/regiony.geojson'
Invoke-WebRequest 'https://raw.githubusercontent.com/Astaryon/UA_geojson/main/rayony.geojson' -OutFile 'data/rayony.geojson'
```

Commit the data directory as well. No Python change. If boundaries fail to load, the existing region-centre fallback remains visible, labelled as approximate administrative markers; the map reports how many keys matched. Name matching uses exact aliases, including known district renames, not guessed coordinates. Source properties and real coverage need to be checked with the downloaded files. No hromada/subdistrict geometry or inferred danger zones are used.

## Status rules

- Explicit whole-oblast alert: full oblast fill.
- `scope: district`: the oblast remains neutral; only districts with an explicit status receive their own fill. Unknown districts never inherit an aggregate alert.
- A district all-clear never cancels an active whole-oblast alert.
- Offline/stale: neutral map; no active animation.
- Pulse can be disabled; reduced-motion preference respected. No rapid flashes.
- Map click selects the parent region; tooltips distinguish statuses.

## Tests

Run `node --check app.js`, `node --check boundaries.js`, and `node test-boundaries.cjs`. Tests use synthetic feature properties. Live GeoJSON and Telegram WebView were not verified.

## Visitor geolocation

- Telegram Mini App: `Telegram.WebApp.LocationManager` (Bot API 8.0+) with native permission prompt. Regular HTTPS browser: `navigator.geolocation.watchPosition`. A denied native permission is not bypassed.
- Requests location at opening. The first valid fix selects the containing oblast using local GeoJSON polygons (including polygon holes and multipolygons), and fits the map to its bounds. The district is shown when its polygon is available. The detected region is approximate, not an official location determination.
- Blue marker and accuracy circle update while the page is visible. Telegram checks every 30 seconds after consent, browser uses location callbacks. The map does not jump while reading another region. Tap “Моя геопозиція” to recenter and select your current region again. Tap “Вимкнути” to stop requests and remove the marker.
- No coordinates, user identifier or location history are sent to Heroku, Telegram bot, storage or geocoding service by the application. The underlying OpenStreetMap tile requests reveal the viewed map area to the tile provider; Telegram/OS manages location permissions.
- No boundaries or outside coverage: marker remains usable, region is not guessed. Missing city boundaries may affect the city/oblast distinction. The accuracy circle is an estimate; do not rely on the selected region for decisions about leaving shelter.
- Keep your existing `data/*.geojson` when deploying. They are not included in the archive. No changes to Python or Heroku.
- Tests: `node --check geolocation.js` and `node test-geolocation.cjs`. Synthetic geometry and mocked browser callbacks; real GPS and Telegram clients have not been tested.

# Air Monitor v6 — administrative polygons

Frontend update to the v5 site. Deploy all files in this directory to the root of your existing GitHub Pages repository. The API URL remains `https://ittusovkaeuserver.herokuapp.com/api/alerts`. The v5 Python API is unchanged. No extra alert services or credentials.

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

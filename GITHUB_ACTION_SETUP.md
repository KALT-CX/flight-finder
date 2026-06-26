# GitHub Action: Auto-update CX HKG flights.json

This package updates your GitHub Pages `flights.json` automatically using Aviation Edge Future Schedules API.

## Files to add to your repository

```text
scripts/update-flights.mjs
.github/workflows/update-flights.yml
```

Keep your existing `flights.json` in the repository root. The script reads the existing file to preserve destination metadata such as `country` and `arrival_city` for known airports.

## Important: do not hardcode your API key

Add the API key as a GitHub Actions secret:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
Name: AVIATION_EDGE_API_KEY
Value: your Aviation Edge API key
```

Because you pasted the API key in chat, it is safer to rotate/regenerate the key in Aviation Edge if possible, then store the new key in GitHub Secrets.

## What the workflow does

- Runs daily at 03:00 HKT.
- Can also be run manually from GitHub Actions using `workflow_dispatch`.
- Fetches CX departures from HKG for the next 30 days.
- Removes the date and keeps only `HH:mm` time.
- Deduplicates by:
  - `flight_number`
  - `arrival_airport`
  - `departure_time`
  - `arrival_time`
- Writes the result to `flights.json`.
- Commits the updated `flights.json` back to the repository.

## Expected output format

```json
{
  "country": "🇯🇵 Japan",
  "arrival_city": "Tokyo Narita (NRT)",
  "arrival_airport": "NRT",
  "flight_number": "CX524",
  "departure_time": "01:20",
  "arrival_time": "06:50",
  "duration": "5h 30m",
  "departure_band": "Night",
  "arrival_next_day": false
}
```

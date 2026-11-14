# Project: Field Shift AR — Living Field Lens (NASA Space Apps 2026)
- Stack: Next.js (App Router), TypeScript, Tailwind CSS, Lucide Icons, Recharts, Canvas/WebAudio API.
- Single-deployment architecture: Keep all backend logic inside Next.js API routes (`/api/nasa-power` and `/api/soil-voice`) for zero-CORS deployment to Vercel.
- Mandatory NASA Rubric Rule: Every crop rotation comparison MUST return 3 strategies (1. Current Baseline, 2. Bare-Window Bridge Crop, 3. Hydro-Shield Multi-Year Rotation) and each strategy MUST explicitly contain these 5 fields:
  1. `why_suggested`
  2. `nasa_evidence` (citing SMAP, ECOSTRESS, Landsat NDVI/BSI, GPM, SRTM, or NASA POWER)
  3. `expected_benefits`
  4. `satellite_info_gaps` (what orbital sensors cannot see at 30m-9km resolution)
  5. `local_expert_risks` (what requires farmer/agronomist ground validation)
- Desktop Fallback Rule: Always include a "Simulate Field Camera" toggle that renders an animated procedural/video soil canvas behind the AR HUD so desktop judges without a phone rear camera get the full experience.

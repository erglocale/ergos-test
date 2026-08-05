# ergos-test — porting conventions

UI/UX sandbox replicating the production ergOS frontend (`../ergOS-frontend`,
Vite + react-router) in Next.js. **No backend** — all data comes from a
localStorage-backed dummy store. The goal is a faithful visual/UX replica that
the team can restyle and experiment on.

## Stack

- Next.js 16 App Router, TypeScript, `src/` dir, route group `src/app/(app)/`
  holds every authenticated page (its `layout.tsx` renders the replica sidebar).
- Ant Design 6 (`antd`), `@ant-design/icons`,
  `react-icons`, `echarts-for-react`, `dayjs`, `sonner`, Tailwind 4 utilities.
- Brand primary `#f97417`; sidebar bg `#F7F3F1`; active item bg `#F4EBE4`.

## Data — `src/data/`

- `types.ts` — entity types. `fixtures.ts` — deterministic generator.
  `store.ts` — localStorage store.
- In pages: `const db = useDb()` (reactive whole-DB snapshot), then
  `db.sessions`, `db.vehicles`, `db.chargepoints`, `db.drivers`, `db.trips`,
  `db.alerts`, `db.users`, `db.wallets`, `db.suggestions`, `db.profile`.
- CRUD: `createRow(key, row)`, `updateRow(key, id, patch)`,
  `removeRow(key, id)`, `nextId(key, prefix)`, `updateProfile(patch)`,
  `resetDb()` from `@/data/store`.
- **Do not edit `src/data/*`** (parallel porting — avoid conflicts). If the
  original screen shows a field the fixtures lack, derive it locally in the
  page (compute it, or hardcode a sensible dummy) instead of changing the
  store. Note the gap in your final report.

## Porting rules

1. **Replicate the original screen's layout, spacing, colors and copy** —
   inline styles copied verbatim are fine; this is a lookalike, not a
   refactor. Keep the same URL paths as the original router.
2. Replace all `axios`/`react-query` fetching with the store. Loading
   states/skeletons may be kept for realism but should resolve instantly.
3. `formik`/`yup` are NOT installed — use antd `Form` for forms.
   `lucide-react` is NOT installed — substitute `react-icons` or antd icons.
4. Maps are REAL Google Maps: `@googlemaps/js-api-loader` +
   `@googlemaps/markerclusterer` via the shared loader `src/lib/googleMaps.ts`
   (single `setOptions`/`importLibrary` — never load the script yourself).
   Key comes from `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local`.
   Components live in `src/components/maps/` (`DashboardMap`, `TripRouteMap`,
   `VehicleRealtimeMap`, `ChargerLocationMap`) — reuse them. Only when the key
   env var is empty do they render the old gray placeholder div
   (`background:#e8e4e0`, "Map unavailable") with the real map's dimensions.
5. Charts: use `echarts-for-react` mirroring the original echarts options.
6. Exports (xlsx/zip/QR/print): render the buttons; on click either build a
   simple CSV client-side or `message.info("Not available in the sandbox")`.
7. Mutations must actually work through the store (add/edit/delete rows) so
   CRUD flows are testable end-to-end.
8. Pages are client components (`"use client"`). Import antd directly.
9. Times: `dayjs(iso).format("DD MMM YYYY, hh:mm A")` unless the original
   formats differently. Currency: `₹`.
10. Do NOT run `pnpm dev`/`pnpm build` (shared `.next/` — parallel agents).
    Type-check with `npx tsc --noEmit` from the repo root instead.

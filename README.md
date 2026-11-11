# TRAFFIC PUZZLE

A mobile-first, strictly top-down 2D traffic-planning puzzle. Connect a growing settlement, design useful road links, and keep traffic moving without creating gridlock.

## Product direction

- Strict 2D top-down view; camera pan and zoom only — no isometric perspective or 3D rotation.
- The map is the main play area on every platform.
- All mobile devices share one interaction model and visual layout; landscape adapts spacing, not the control paradigm.
- Desktop may use its extra screen area for a dispatcher panel alongside the map.
- The settlement and travel demand grow automatically. The player shapes roads, junctions, directions and traffic flow rather than managing a city economy.
- Continuous road geometry with natural bends, connected T/X junctions, clear access points and obstacle-aware construction.
- Traffic agents use the road graph, respect one-way links, and choose routes based on reachability and congestion.
- New regions and scenarios should introduce meaningful transport problems, not just larger maps.

## Technology

- TypeScript + Vite
- Canvas 2D renderer
- CSS responsive interface
- Browser-first deployment; PWA and native packaging can follow once the core game is stable.

## Development principles

- Visual clarity and comfortable mobile play come before feature count.
- The same core game and simulation run across platforms.
- Road construction is previewed, validated and then built gradually.
- Only connected, useful roads participate in routing.
- Keep checkpoints (КТ), verify CI and deployment, and report manual device testing separately.
- During the active prototype phase, approved changes may go directly to `main` for fast browser testing.

## Current milestones

- КТ-082 — anchor snapping now chooses the closest physical target: a road tap is no longer stolen by a nearby building access pin, while exact ties still prefer the building entrance.
- КТ-081 — route selection now retains the exact anchor type instead of re-resolving a coordinate on the next tap; preview and commit use identical endpoint permissions and smoothed-path validation, while preview A* is cached and no longer reruns on every animation frame.
- КТ-080 — corrected building-access clearance: endpoint exemptions now form a short outward-facing corridor instead of opening an entire obstacle half-plane; exact access points are validated against their snapped grid points, the route grid is refined from 0.75 to 0.5 units, and both snapped endpoints remain in the reconstructed path.
- КТ-065 — unified interface, mobile dispatcher and consistent controls.
- КТ-066 — readable road states and congestion based on actual traffic constraints.
- КТ-067 — first staged settlement expansion: a new residential site appears after the initial network is connected and adds real origin/destination demand.
- КТ-068 — second growth stage adds a village school after the new home is connected; the school becomes a real service endpoint and opens bidirectional home-to-school traffic.
- КТ-069 — scenario progress is calculated from four actual network conditions (farm, initial homes, new home, school); the dispatcher and map objective update from the same live state.
- КТ-070 — after the first scenario, a medical center appears on the eastern edge as a second transport call; it generates real home-to-service demand and must be connected by the player.
- КТ-071 — construction animation is rendered as a lightweight live overlay instead of invalidating the full static map every frame; road intersections and graph nodes use spatial buckets, and junction geometry is cached until the network changes.
- КТ-072 — moved the school access point inside the roadfinding envelope and validate growth-site access bounds; decluttered the playfield so the map and current objective lead, while traffic details live in an on-demand summary panel.
- КТ-073 — road routing now reserves existing road corridors, farm fields and orchard parcels; growth buildings check both their footprint and access against all roads; A* penalizes unnecessary turns and the resulting route is shortcut-simplified and collision-checked after curve smoothing.
- КТ-074 — completed roads remain valid construction targets even without active traffic.
- КТ-075 — network connection clearance is restricted to the exact selected road segment rather than a circular area that could include parallel roads; obstacle checks now use the same smoothed centreline geometry that is actually rendered.
- КТ-076 — road routing distinguishes true crossings from parallel overlap: perpendicular/diagonal crossings become graph junctions, while travelling along an occupied road corridor stays blocked; junction edge highlights are trimmed at the shared mouth to remove crossing seams.
- КТ-077 — A* validates each actual movement segment, including diagonal crossings, instead of rejecting diagonals because adjacent side cells touch a road; a binary min-heap replaces the quadratic open-set scan and raises the safe search ceiling.
- КТ-078 — road collision geometry is smoothed and collected once per route search, then reused for every A* sample and path-simplification check; this removes repeated full-road reconstruction from the hottest loop.
- КТ-079 — collision segments are indexed in spatial buckets, so A* checks only nearby road geometry; failed searches now explain whether the route is blocked by a building, field/orchard, existing road or search limit. Building access points are prioritized over nearby road snapping.
- Growth buildings are collision-checked, join the road graph only through player-built access, and never appear as random map clutter.

## Run locally

```bash
npm install
npm run dev
``

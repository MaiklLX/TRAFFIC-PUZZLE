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

- КТ-065 — unified interface, mobile dispatcher and consistent controls.
- КТ-066 — readable road states and congestion based on actual traffic constraints.
- КТ-067 — first staged settlement expansion: a new residential site appears after the initial network is connected and adds real origin/destination demand.
- КТ-068 — second growth stage adds a village school after the new home is connected; the school becomes a real service endpoint and opens bidirectional home-to-school traffic.
- Growth buildings are collision-checked, join the road graph only through player-built access, and never appear as random map clutter.

## Run locally

```bash
npm install
npm run dev
``

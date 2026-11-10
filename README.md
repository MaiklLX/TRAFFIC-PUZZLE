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

- КТ-046 — mobile-first fullscreen playfield.
- КТ-047 — meaningful road endpoints and connected construction.
- КТ-048 — destination reachability tied to the road graph.
- КТ-049 — live traffic demand and congestion feedback.
- КТ-050 — two-way trips between homes and services.
- КТ-051 — congestion-aware routing and active-edge filtering (in progress).

## Run locally

```bash
npm install
npm run dev
``

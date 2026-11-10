# TRAFFIC PUZZLE

A cheerful isometric traffic-planning puzzle about turning a small village into a thriving city.

## Product direction

- 2.5D isometric world with a freely navigable camera
- Build and modify roads, junctions, roundabouts and multi-level interchanges
- Traffic simulation with routes, congestion and incidents
- A living settlement that grows as objectives are completed
- New regions with distinct terrain and transport challenges
- Responsive browser game, installable PWA, Android APK and an iOS-ready path

## Technology

- TypeScript + Vite
- Three.js for the 3D/isometric world
- CSS for responsive interface
- PWA support planned; Capacitor packaging follows after the browser build stabilizes

## Development principles

- Visual foundation first, then simulation and progression
- Mobile and desktop are first-class targets
- Local-first saves; no account or server dependency for the core game
- Small verified milestones (КТ), with work on feature branches
- No public release or main-branch gameplay changes without explicit approval

## Roadmap

1. КТ-001 — application shell, renderer, camera and input foundation
2. КТ-002 — first village, terrain and visual language
3. КТ-003 — road editing tools
4. КТ-004 — traffic agents, routing and congestion
5. КТ-005 — objectives, economy and settlement growth
6. КТ-006 — campaign regions and transport variety
7. КТ-007 — PWA, mobile packaging and local save system

## Run locally

```bash
npm install
npm run dev
```

The initial playable foundation is being built on a dedicated feature branch after this repository bootstrap.

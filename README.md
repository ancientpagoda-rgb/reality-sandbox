# Reality Sandbox — Nysa

Nysa is a fictional procedural living planet whose terrain, water cycle, climate, vegetation, animals, and evolution share one simulation state.

## Scientific boundary

**Nysa is not Earth.** The public root presents a generated fictional world and must not imply that its terrain, weather, ecology, or planetary history are measured Earth data.

## Scope freeze

The current product direction is the coupled living-planet experience: planetary formation and geology, terrain, hydrology, climate, vegetation, animal ecology and evolution, globe navigation, and ground-level Surface Mode.

Universe-scale, galaxy, civilization, and later phase work remain frozen for the public root unless the living-planet experience is stable and deliberately reopened.

## Experience gate

**No new phase should be added** until the current experience remains coherent and usable across the supported desktop and mobile paths, including the public GitHub Pages build and browser smoke checks.

## Development

```bash
npm ci
npm run check
npm run dev
```

`npm run check` runs the integration audits and production Vite build used by the Pages deployment workflow.

# Reality Sandbox (Browser)

A deterministic 2D ecosystem/economy sandbox running entirely in the browser. This is the starting scaffold (M1): seeded RNG, fixed-timestep tick loop, and canvas rendering.

## Current Status (M1)

Implemented pieces:

- Static site suitable for GitHub Pages
- Seeded RNG (Mulberry32) with string seed
- Fixed timestep simulation (`dt = 0.06` seconds)
- Start / Pause / Step controls
- Simple world state with a field of particles moving on a toroidal plane (wrap-around)
- Basic canvas renderer with a subtle grid background

This is the foundation for adding entities (Agent, Resource, ForceField), ECS-lite systems, tools, and audio.

## Structure

```text
reality-sandbox/
  index.html
  style.css
  app.js
  README.md
  /core
    rng.js
    world.js
    render.js
```

- `rng.js` – deterministic PRNG for reproducible simulations
- `world.js` – world state and `step(dt)` function (currently just particles + wrapping physics)
- `render.js` – canvas rendering of the world
- `app.js` – UI wiring and fixed-timestep main loop

## Running Locally

From this folder:

```bash
cd reality-sandbox
npx serve .
```

Then open the printed URL (e.g. `http://localhost:3000/reality-sandbox/`), and use the **Start / Pause / Step** buttons to drive the simulation.

Because this is a static site, it will deploy cleanly to GitHub Pages by pointing Pages at the repo root.

## Next Milestones

- **M2:** ECS-lite with explicit entities/components/systems and Agent/Resource types
- **M3:** Steering & metabolism systems, resource consumption & regrowth
- **M4:** Reproduction, death, and calm/storm regimes
- **M5:** Tools (spawn Agent/Resource, ForceField brush, entity inspector)
- **M6:** Snapshot save/load (localStorage), audio mapping, and public deployment

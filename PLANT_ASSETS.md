# Open-source plant assets

Reality Sandbox uses selected models from **Kenney Nature Kit 2.1** for the Surface-mode plant presentation layer.

- Upstream: Kenney Nature Kit
- License: CC0 1.0 Universal (`CC0-1.0`)
- Runtime role: visual representations of real simulated vegetation/resource entities on Nysa
- Selected models: `tree_default.glb`, `tree_oak.glb`, `cactus_short.glb`, `cactus_tall.glb`
- Production delivery: vendored during `npm run build`; no runtime hotlink to Kenney
- Archive SHA-256: `fa797807cae9c3f434db849178bbc44109eee32533f07a9ae606ece46acad94c`

The vendoring step is implemented by `scripts/vendor-cc0-plants.mjs`. It downloads the pinned upstream Nature Kit archive, verifies the archive hash, extracts only the selected GLB files, and writes a same-origin manifest and source/license note into `public/vendor/kenney-nature-kit/` before Vite builds `dist/`.

The runtime integration lives in `core/surface-globe-plant-models-v74.js`. It does not scatter decorative plants independently of the simulation. Instead, it reads the ECS resource/position components, chooses an appropriate visual model using the simulated biome/resource state, and places the model at that entity's spherical position on the canonical Nysa globe.

The Three.js/GLTF plant layer is lazy-loaded only after Surface mode is entered, so ordinary root startup remains on the canonical Pixi globe renderer.

# Abiogenesis Lab

A standalone experiment engine for testing whether life-like systems can emerge from physically constrained planetary chemistry without scripting a biological outcome.

> **Project rule:** nothing exists at a higher level unless the level beneath it can account for why it exists.

## What v0.2 does

- Seeds chemical inventories from stellar metallicity, disk C/O ratio, planet composition, atmosphere retention, and water inventory.
- Generates spatial early-planet environments with water, minerals, hydrothermal activity, wet/dry cycling, UV, and temperature structure.
- Runs a stoichiometrically balanced coarse-grained reaction network constrained by thermodynamic direction, Arrhenius-style barriers, catalysis, and available environmental energy.
- Tracks represented matter continuously, including material transferred out of ordinary chemistry and into polymers.
- Lets generic sequence-bearing polymers arise **on mineral/wet-dry surfaces or inside amphiphile compartments**. No RNA milestone is inserted.
- Performs explicit templated copying. Copy errors change sequences and therefore create heritable variants.
- Gives sequence variants deterministic coarse-grained catalytic/copy/stability traits, allowing differential reproductive success to be measured.
- Lets amphiphile compartments capture environmental polymers, grow, lose energy, release polymers on failure, and potentially divide.
- Detects local chemical proto-life niches from hotspots rather than washing them out in planet-wide means.
- Preserves the most advanced state reached during each run, even if a replicator population later collapses.
- Automatically archives a run and reseeds after a configurable no-life cutoff.
- Runs many deterministic seeds headlessly and summarizes outcome classes, evolutionary events, and peak complexity.
- Includes a browser visualizer for chemistry, polymers, heredity, replication, selection, and experiment history.

## Outcome classes

1. `no-life` — no sufficiently persistent proto-life or replicator state appeared.
2. `transient-proto-life` — persistent compartment/self-maintaining chemistry appeared, but templated heredity was not demonstrated.
3. `transient-replicator` — actual sequence templates copied with measurable fidelity for a sustained window, but the system did not maintain the stricter heredity + replication + variation + selection criteria required for Darwinian life.
4. `sustained-darwinian-system` — explicit heritable copying, variation, differential reproductive success, adequate population/variant depth, and sustained generations coexist long enough to pass the detector.
5. `cellular-life` — a sustained Darwinian system also demonstrates persistent compartments, metabolism, and repeated compartment division.

Failure and collapse are valid outcomes. A run is never promoted because time elapsed.

## Run it

```bash
npm test
npm run batch -- --runs 100 --cutoff 5000
npm run serve
```

Then open `http://localhost:4173/`.

For faster exploratory batches, reduce spatial resolution and/or increase the fixed chemistry step:

```bash
npm run batch -- --runs 100 --cutoff 2500 --columns 8 --rows 4 --dt 1
```

The browser lab has a configurable cutoff and **Auto-rerun**. When a run reaches the cutoff without detected life, its most advanced result is archived and a new deterministic seed begins automatically.

## Browser controls

The lab can visualize ordinary chemistry (organics, amphiphiles, precursors, chemical diversity, free-energy flux), planetary drivers (water, hydrothermal activity, wet/dry cycling, UV), individual species, and the new evolutionary layer: all polymers, free surface polymers, sequence variants, heredity, replication, and selection.

Clicking a grid cell shows local chemistry plus the actual polymer sequences currently on that surface or inside local compartments.

## Current validation checkpoint

The v0.2 test suite verifies reaction balance, deterministic matter conservation, chemistry→polymer material transfer, templated copying, mutation, surface replication without compartments, conservative life classification, pure snapshots, cutoff reseeding, and preservation of transient peak states.

An unbiased 8-run validation batch at cutoff 2500 (8×4 grid, dt 0.5) produced:

- 4 `no-life`
- 4 `transient-replicator`
- 0 `sustained-darwinian-system`
- 0 `cellular-life`

Peak observed polymer population was 310 and peak template generation was 200. Mean represented elemental drift remained around numerical floating-point noise (~1e-15). These are model-validation results, not claims about historical Earth.

## Reality Sandbox adapter

`src/reality-sandbox-adapter.js` defines the boundary: Reality Sandbox supplies astrophysical, planetary, geological, and local environmental conditions; Abiogenesis Lab evolves chemistry and prebiotic evolution and returns its state/classification. The lab does not depend on animals, civilizations, or rendering systems.

## Scientific scope

This is a hypothesis-generation simulator, not evidence that a particular abiogenesis pathway occurred historically on Earth. Reaction constants, generic polymer chemistry, and sequence→function mapping are still exploratory priors. The most consequential next upgrade is to replace the current generic sequence-trait approximation with physically derived polymer interactions and experimentally grounded kinetic/thermochemical ranges.

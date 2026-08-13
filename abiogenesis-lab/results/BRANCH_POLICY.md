# Abiogenesis results branch policy

The `abiogenesis-results` branch is the append-only publication target for detector-qualified Abiogenesis Lab results.

- Experiment automation may write only under `abiogenesis-lab/results/` on this branch.
- Project source code on `main` is not modified by result publication.
- Only `sustained-darwinian-system` and `cellular-life` records that validate against `abiogenesis-success.schema.json` may be added to `results/successes/`.
- Every success record must preserve the producing commit, deterministic seed, normalized experiment configuration, detector evidence, metrics, and terminal state.
- `results/index.json` is updated only when a new qualified success is appended.
- No-life, transient proto-life, transient-replicator, and raw trajectory data are not permanently committed here.
- Existing success records are not rewritten by routine experiment runs; corrections should be additive and explicitly documented.

# Abiogenesis success archive

This directory is the permanent catalog for detector-qualified abiogenesis events produced by Abiogenesis Lab.

Only two classifications are eligible for permanent success records: `sustained-darwinian-system` and `cellular-life`. A record must also state `lifeDetected: true`, `termination: life-detected`, and `qualification: detector-qualified`.

Successful records belong in `results/successes/` and are listed by `results/index.json`. Each record preserves the exact producing Git commit, model/detector version, deterministic seed, normalized experiment configuration, abiogenesis time, detector evidence, chemistry metrics, evolutionary metrics, and terminal state so the experiment can be reproduced.

Transient replicators, transient proto-life, and no-life runs are not success records. Raw batch trajectories should be retained as experiment artifacts/datasets rather than committed indefinitely to Git.

Schema: `abiogenesis-success.schema.json`.

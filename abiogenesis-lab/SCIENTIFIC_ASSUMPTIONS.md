# Scientific assumptions and non-claims

Abiogenesis Lab v0.2 is a causal simulation scaffold, not a quantitatively calibrated origin-of-life model.

## Grounded constraints already enforced

- reaction stoichiometry is element-balanced;
- reaction direction responds to a coarse Gibbs-energy term;
- kinetic accessibility responds to temperature and Arrhenius-style activation barriers;
- mineral, hydrothermal, wet/dry and UV terms alter kinetic accessibility rather than directly spawning biological milestones;
- spatial transport is represented through diffusion;
- represented elemental conservation includes matter transferred from chemistry into polymer objects;
- initial chemical inventory is conditioned by astrophysical/planetary parameters;
- polymer replication consumes carbon-, nitrogen-, and phosphate-bearing chemical feedstock;
- daughter templates are generated from parent sequences with explicit copying errors;
- polymers can originate outside compartments, so the model does not require lipid-first abiogenesis;
- compartments can capture/release polymers and divide only through their evolving state.

## Deliberate coarse-graining

The chemical species are effective pools. `reducedCarbon`, `formamide`, `amphiphile`, and `condensate` summarize families of chemistry rather than unique historically established intermediates. Rate constants and energetic coupling strengths remain exploratory.

The v0.2 polymer alphabet (`A/B/C/D`) is deliberately generic. Sequence-dependent copy, stability, membrane, and catalytic traits are deterministic coarse-grained priors derived from sequence identity; they are **not yet calculated from molecular structure or quantum chemistry**. This makes v0.2 useful for testing causal evolutionary architecture, but not for quantitative claims about which real polymer system should emerge.

Rare sequence variants are adaptively coarse-grained when genotype diversity exceeds the explicit-resolution budget. Their population and material are retained; this is a resolution limit, not a population cap.

## Strict life claim boundary

A chemically rich region is not life. A polymer that copies once is not life. `transient-replicator` is explicitly a non-life classification used to preserve interesting failed attempts.

`sustained-darwinian-system` requires simultaneous, sustained evidence of:

- templated replication;
- copying fidelity sufficient for heredity;
- heritable variation;
- differential reproductive success;
- multiple sequence variants and adequate population depth;
- sustained template generations.

`cellular-life` additionally requires persistent compartments, metabolism, and repeated compartment generations/divisions.

## Consequence-weighted next validation work

1. Replace generic sequence→function priors with polymer structure/interaction models and traceable experimental constraints.
2. Replace single reaction constants with uncertainty distributions and propagate those uncertainties into run outcomes.
3. Add adsorption/desorption, concentration, polymer folding, catalytic motifs, ligation, cleavage, and explicit template complementarity.
4. Improve compartment permeability, osmotic balance, membrane composition, fusion, fission, and material exchange.
5. Add adaptive/event-driven stepping so thousands of long runs are computationally practical without changing causal rules.
6. Define open-ended-evolution tests before treating `cellular-life` as more than a minimal cellular threshold.

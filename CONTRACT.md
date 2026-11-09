# Exact bounded contract: hingelab-v1

## Inputs

Exactly `layers`, `output`, `domain`, `reference`, `radius`.

- `layers`: one or two layers. Each has exactly `weights` (row-major matrix) and `bias` (vector). Width is 1..3. The first layer has one incoming coordinate; later rows match prior width.
- `output`: exactly `weights` and `bias`, one scalar affine output of the last hidden layer. Hidden layers apply max(0, preactivation); the output does not apply ReLU.
- Every scalar is a JSON integer (not boolean), or a string matching `[-+]?[0-9]+(?:/[0-9]+)?`. The denominator must be nonzero. Absolute reduced value ≤ 32; reduced denominator ≤ 1,024. Nonintegral JSON numbers and decimal strings are not accepted. An integral numeric value such as 1.0 is accepted and treated as 1. Integers can be written as fractions. Values are normalized in report fields, but `request` preserves the supplied JSON.
- `domain`: two endpoints lo < hi, both included. `reference` lies inside. `radius` is nonnegative.
- Class 1 iff output margin ≥ 0, including ties. Class 0 iff margin < 0.

## Output semantics

`cells` cover the whole domain, overlapping only at shared endpoints, in sorted order. `slope` and `intercept` describe the scalar margin on the entire closed cell. `activation` describes each hidden layer on the open interior: strictly positive preactivations are on; identically zero preactivations are canonically off. A boundary can have a different actual zero pattern. Adjacent cells are not merged merely because output formulas happen to coincide.

`zero_sets` are per-cell closed intervals or singleton roots, in cell order. They may repeat a shared root or retain adjacent zero plateaus. They are witnesses, not a minimal zero-set union.

`adversarial_sets` are a canonical sorted disjoint union of opposite-class intervals, with explicit `left_closed` and `right_closed`. A singleton requires both flags. Touching intervals are merged exactly when at least one includes their shared endpoint. The sets are restricted to the declared closed domain.

`distance_infimum` is the exact infimum of absolute distance from the reference to this set. Null means the set is empty. `minimum_attained` is null only for the empty set; otherwise true iff some opposite-class point attains the infimum. `nearest_adversary` is the smallest-coordinate attaining point, or null if absent or not attained.

`closed_ball_robust` means every point in domain intersected with [reference - radius, reference + radius] has the reference class. If false, `radius_witness` is an actual opposite-class rational point in that intersection. A valid witness need not be nearest. If true it is null.

`lipschitz` is the exact maximum absolute margin slope on this domain. Network continuity makes that the least Lipschitz constant here. There is no claim about behavior outside the domain.

All numerical report fields are reduced fraction strings; booleans, class integer and nulls keep their types. `schema` is `hingelab-v1`. Extra report keys are rejected by the independent checker.

## Algorithms and limits

The generator repeatedly splits each current interval at every interior root of the next layer's affine preactivations. No activation grid is sampled. It then solves the output sign condition within each cell and unions the resulting intervals with endpoint topology intact.

The checker independently enumerates 2^H masks (H ≤ 6), derives affine phase constraints and intersects their rational half-lines with the domain. Weak on/off constraints overlap at zero, so the checker discards interior masks that violate the canonical zero convention. It compares the complete cell list, checks domain coverage and directly evaluates the network on every endpoint/root atom and every intervening open interval. Sign is constant on each such atom, so this is exact finite exhaustion, not a sampled approximation. It independently computes distances and checks any radius witness.

For at most two width-three layers, there are at most (3+1)^2 = 16 forward cells. The checker visits at most 64 masks. Arithmetic is rational and its bit cost is not constant; no performance or scalability claim is made. The generator and checker share only strict input parsing and direct point evaluation, not region construction or set synthesis.

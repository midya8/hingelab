# Exact all-radius robust-length profile

The wrapper request has exactly `network` (the unchanged base network request)
and `target_fraction` (a bounded rational in [0,1]). Saved `network.radius` and
`network.reference` are validated but do not change the profile. The radius
horizon is the closed interval [0,32]. All base bounds and class-1 ties apply.

## Report

`hingelab-radius-v1` contains the original request, radius_domain ["0","32"],
domain_length and ordered classes 0 then 1. Each class has length_segments and
existence_radius_regions. The total has those same two fields, plus target_length
and first_radius_at_most, a rational string or null when unattained in the horizon.
Each length segment contains rational strings left, right, slope and intercept.
It gives L(r) = slope*r + intercept on its closed radius interval. Adjacent
segments agree at the shared endpoint; maximally merge equal affine formulas.
Existence intervals retain boolean endpoint flags. An empty list means no radius
has a robust reference in that class. A singleton [0,0] is not an empty interval.

Length is exact Lebesgue interval length. A zero target means zero measured
length, not disappearance of every robust reference. The first-radius query is
attained because length is continuous on this compact horizon. If the requested
length is never reached it returns null, not an invented radius past 32.

## Generator

For each canonical class component of width w, let s be the number of its ends
that are not included domain edges. Then its robust length is max(w-s*r,0).
An included domain edge is fixed by relative-domain clipping. s is 0,1 or 2;
s=0 is a whole-domain component that remains robust at every radius. For s>0,
its extinction threshold is w/s. A component exists up to that threshold, with
equality precisely when both original endpoints are closed. An isolated class-1
tie has w=0 and exists only at radius zero. Empty classes have no components.
Sum these clipped affine lengths, partition at w/s inside (0,32), merge equal
formulas and solve each piece for the earliest L(r) <= target_length. Component
existence intervals are nested starting at zero, so their union ends at the
largest threshold, retaining equality if any component owns that threshold.

## Independent finite checker

`radius_oracle.py` imports neither radius/reference generators nor their union,
erosion or segment routines. It imports the base independent mask enumerator,
strict parser and direct evaluator. It splits mask regions at every output root,
retaining boundary point atoms and open interval atoms with their actual class.

For fixed radius r, a reference can change robustness only at p, p-r or p+r for
an original boundary/root p. The checker enumerates these inside the domain,
tests every point and intervening open interval against every opposite-class atom
for closed-ball intersection, and sums exact interval widths. Existence includes
safe singleton critical points, independently of length.

As r varies, the order and coincidence of these affine critical-reference
expressions can change only at differences |p-q| or half-differences |p-q|/2,
also including horizon endpoints. Between consecutive candidate radii, all
intersection signs and reference-atom ordering are fixed. Every accepted open
reference atom has affine endpoints, so its length and their sum are affine.
The checker reconstructs each affine formula at its two interior trisection
radii, checks the midpoint and both exact endpoints, and checks existence on
radius-point atoms separately from open radius intervals. It merges only equal
neighboring formulas and reconstructs the exact existence union. This covers
every radius atom, not a sampled-grid proof. The candidate set is deliberately
larger than the true profile breakpoint set.

The inverse answer is recomputed from this separate profile. Full normalized
JSON serialization compares exact fields and value types, rejecting boolean/one
substitution and additional fields. Shared parsing/evaluation are explicit.

At most 64 activation masks and 16 forward cells under the base architecture.
If there are P mask-derived boundary/root points, candidate radii are O(P²),
and each radius measures O(P) reference atoms against O(P) class atoms, giving
O(P⁴) intersection checks, plus mask enumeration, network evaluation and sorting.
Rational bit cost is not constant. No large-model performance claim.

## Reproduce

```sh
python -m unittest discover -s tests -v
npm test
bash tools/check_wheel.sh
# wrapper.json: {"network": <base request>, "target_fraction": "1/2"}
python -m hingelab radius wrapper.json > profile.json
python -m hingelab radius-verify profile.json
# Installed console: hingelab radius / radius-verify
python -m http.server --directory docs 8000
# Open /radius.html
```

The browser uses exact normalized BigInt fractions for the report. Only SVG
coordinates and tick labels are floating point. The detail plot ends just beyond
the last total length breakpoint (or at 1 for a constant profile); the full plot
always shows [0,32]. An independently checked label requires Python acceptance of
the downloaded JSON, not merely browser computation.

## Examples and attribution

- Margin x, D=[-2,2]: total L(r)=max(4-2r,0); class 0 exists for r in [0,2),
  class 1 for r in [0,2]. First zero-length radius is 2, where {2} still exists.
- Margin -|x|: class-1 existence is the singleton radius set {0}; its measured
  robust length is zero even there.
- Nested tent: class 1 exists for r in [0,1/2], retaining exactly one reference
  at 1/2. Total profile has breakpoints 1/2 and 3/2.
- Constant class: target fraction below 1 is unattained; target 1 is met at zero.

Uses established piecewise-affine line restrictions and set erosion, not a novel
algorithm or result from the cited papers. See SOURCES.md and REFERENCE.md for
primary neural-network and morphology sources and the explicit distinction from
open-ball erosion. No model training/import, high-dimensional certificate,
benchmark, accuracy/data-probability estimate or paid service.

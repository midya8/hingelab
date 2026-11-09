# Exact reference robustness atlas

For a fixed radius r, return every x in the declared closed domain D for which
`[x-r, x+r] ∩ D` stays in x's own class. Class 1 means margin ≥ 0. Class 0 means
margin < 0. This is a universal set calculation, not a test on sampled references.

## Contract

All base input limits in CONTRACT.md remain unchanged. `reference` is required
by the shared request format but affects only the displayed point check, not
any reference-atlas set or length. The schema is `hingelab-reference-v1`:

- `classes`, ordered 0 then 1: exact `regions`, exact `robust_regions`,
  `class_length`, `robust_length`.
- `domain_length`, total `robust_length`, and their exact `robust_fraction`.
- Original `request` and schema name.

Each interval uses rational-string `left` and `right` and boolean endpoint
flags. A singleton is closed at both ends. Empty sets are empty lists. Unions
are sorted, disjoint, and merge touching pieces if the shared point is included.
Length is Lebesgue interval length, not probability or accuracy. A singleton
exists but has zero length. No nonempty-set claim follows from length alone.

## Forward construction

First split the exact forward affine cells at every output root. Evaluate each
root/boundary point and each open sign interval to form canonical class
components. For each class component I with bounds l,u, move its left bound to
l+r and its right bound to u-r, retaining its endpoint flags. If l is an included
left domain edge, leave it fixed; similarly for an included right domain edge.
Discard reversed intervals and degenerate intervals unless both ends include
the remaining point.

Why: a reference's closed ball cannot cross a class boundary. If the component
owns that boundary, equality at radius r is allowed. Otherwise equality reaches
an opposite-class point, so the shifted endpoint is excluded. Beyond an included
domain edge the ball is clipped, not assigned an invented outside class. At r=0
this is exactly the original class partition, including isolated ties. A constant
class on the entire domain remains robust at every permitted radius.

This is relative-domain set erosion by a closed interval. It is not ordinary
full-line erosion with an implicit outside background.

## Independent checker

`reference_oracle.py` imports neither the forward reference generator nor its
erosion/union routines. It reuses the base independent activation-mask enumerator
and shared parser/direct network evaluator. It splits every mask-region boundary
and output root into singleton and open-interval class atoms. A reference x is
robust iff no opposite-class atom intersects its closed radius interval.

The class and robustness status can only change at an original boundary/root
or at one of those points shifted by ±r. The checker examines every such point
inside D and every intervening open interval. On each open interval, the side
of every opposite atom's translated endpoint is fixed; no intersection predicate
can change there. It reconstructs the entire canonical class/robust unions and
all lengths and compares the full report, including JSON value types and keys.
This is finite exact exhaustion, not an empirical grid argument.

Mask enumeration is at most 64 masks. Forward cells are at most 16. With P class
atoms and O(P) critical points, the direct checker makes O(P²) atom-intersection
checks, in addition to network evaluation and mask enumeration. Rational bit
cost is not constant and no large-network scaling claim is made.

## Reproduction

```sh
python -m unittest discover -s tests -v
npm test
bash tools/check_wheel.sh
python -m hingelab reference request.json > report.json
python -m hingelab reference-verify report.json
# Installed console commands: hingelab reference / reference-verify
python -m http.server --directory docs 8000
# Open /reference.html
```

The browser uses normalized BigInt arithmetic for all sets and lengths. SVG
coordinates alone use floating point. Downloaded browser JSON is not independently
checked until Python accepts it.

## Deliberate examples

- margin x, domain [-2,2], radius 1: class 0 robust [-2,-1), class 1 robust [1,2].
- margin -|x|: isolated class-1 tie {0} is robust at radius zero, not at any
  positive radius; it is never silently erased from the original class set.
- Nested tent: class-1 component [-1/2,1/2], radius 1/2: robust singleton {0}.
  At radius 513/1024 it disappears. Class 0's disjoint outer components remain
  separate and keep strict inner endpoints.
- Constant-zero margin: all domain references remain robust even at radius 32.

## Attribution and nonclaims

Uses established exact line restrictions and morphological set erosion.
Heijmans' *Mathematical Morphology: an Algebraic Approach*, §1.2, defines erosion
by structuring-element containment. The closed structuring interval and relative
D used here are explicit. Pegden's *Sets resilient to erosion* defines its radius
erosion using open balls and distance ≥ r, so its convention cannot be substituted
for this closed-ball classifier calculation. Both are source context, not claims
that this implements either paper's larger results. See SOURCES.md and the base
contract for neural-network sources. No new algorithm, training, imported model,
high-dimensional certificate, benchmark, distributional guarantee or paid service.

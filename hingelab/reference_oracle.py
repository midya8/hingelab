"""Independent mask/critical-atom verifier. No forward or erosion import."""

from fractions import Fraction as F
import json
from .model import parse, direct, text
from .oracle import mask_regions


def reference_verify(report):
    try:
        raw = report["request"]
        layers, out, lo, hi, _, rad = parse(raw)
        regions = mask_regions(raw)
        points = {lo, hi}
        for l, r, a, b, _ in regions:
            points.update([l, r])
            if a and l <= -b / a <= r:
                points.add(-b / a)
        ordered = sorted(points)
        atoms = [(p, p, True, True, int(direct(layers, out, p) >= 0)) for p in ordered]
        atoms += [
            (a, b, False, False, int(direct(layers, out, (a + b) / 2) >= 0))
            for a, b in zip(ordered, ordered[1:])
        ]
        critical = sorted(
            points | {q for p in points for q in [p - rad, p + rad] if lo <= q <= hi}
        )

        def safe(x, label):
            for a, b, ac, bc, c in atoms:
                if c == label:
                    continue
                u, v = max(a, x - rad), min(b, x + rad)
                if u < v or (u == v and (a < u < b or u == a and ac or u == b and bc)):
                    return False
            return True

        # Build canonical interval unions from all critical point/open-gap atoms,
        # deliberately without calling the generator's union or erosion code.
        def collect(predicate):
            result = []
            seq = []
            for i, p in enumerate(critical):
                if predicate(p):
                    seq.append([p, p, True, True])
                if i + 1 < len(critical):
                    q = critical[i + 1]
                    if predicate((p + q) / 2):
                        seq.append([p, q, False, False])
            for a, b, ac, bc in seq:
                if result and a == result[-1][1] and (ac or result[-1][3]):
                    result[-1][1] = b
                    result[-1][3] = bc
                else:
                    result.append([a, b, ac, bc])
            return [
                dict(left=text(a), right=text(b), left_closed=ac, right_closed=bc)
                for a, b, ac, bc in result
            ]

        rows = []
        for label in [0, 1]:
            own = lambda x: int(direct(layers, out, x) >= 0) == label
            sets = collect(own)
            robust = collect(lambda x: own(x) and safe(x, label))
            length = lambda ss: text(
                sum((F(s["right"]) - F(s["left"]) for s in ss), F(0))
            )
            rows.append(
                dict(
                    class_label=label,
                    regions=sets,
                    robust_regions=robust,
                    class_length=length(sets),
                    robust_length=length(robust),
                )
            )
        total = sum((F(r["robust_length"]) for r in rows), F(0))
        expected = dict(
            schema="hingelab-reference-v1",
            request=raw,
            classes=rows,
            domain_length=text(hi - lo),
            robust_length=text(total),
            robust_fraction=text(total / (hi - lo)),
        )
        return json.dumps(report, sort_keys=True, separators=(",", ":")) == json.dumps(
            expected, sort_keys=True, separators=(",", ":")
        )
    except (ValueError, TypeError, KeyError, ZeroDivisionError, OverflowError):
        return False

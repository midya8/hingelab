"""Complete activation-mask enumeration and atomic-set certificate checking.

Does not import the forward partitioner or its set-construction routine.
"""

from fractions import Fraction as F
from itertools import product
import json
from .model import parse, direct


def mask_regions(raw):
    layers, out, lo, hi, ref, rad = parse(raw)
    regions = []
    for flat in product((0, 1), repeat=sum(len(b) for w, b in layers)):
        left, right = lo, hi
        previous = [(F(1), F(0))]
        index = 0
        masks = []
        valid = True
        for weights, bias in layers:
            values = []
            bits = []
            for row, c in zip(weights, bias):
                a = sum(w * x for w, (x, y) in zip(row, previous))
                b = c + sum(w * y for w, (x, y) in zip(row, previous))
                bit = flat[index]
                index += 1
                bits.append(bit)
                # Weak phase constraints overlap at zero. Degenerate masks are
                # retained during feasibility, then omitted from open cells.
                sign = 1 if bit else -1
                aa, bb = sign * a, sign * b
                if aa > 0:
                    left = max(left, -bb / aa)
                elif aa < 0:
                    right = min(right, -bb / aa)
                elif bb < 0:
                    valid = False
                values.append((a, b) if bit else (F(0), F(0)))
            previous = values
            masks.append(bits)
        if valid and left < right:
            # All-zero phases must use the canonical inactive bit on the interior.
            mid = (left + right) / 2
            v = [mid]
            actual = []
            for w, b in layers:
                z = [sum(a * x for a, x in zip(row, v)) + c for row, c in zip(w, b)]
                actual.append([int(t > 0) for t in z])
                v = [max(F(0), t) for t in z]
            if masks != actual:
                continue
            w, b = out
            a = sum(z * x for z, (x, y) in zip(w, previous))
            c = b + sum(z * y for z, (x, y) in zip(w, previous))
            regions.append((left, right, a, c, masks))
    return sorted(regions, key=lambda z: z[:2])


def verify(report):
    try:
        if not isinstance(report, dict) or set(report) != {
            "schema",
            "request",
            "reference_margin",
            "reference_class",
            "cells",
            "zero_sets",
            "adversarial_sets",
            "distance_infimum",
            "minimum_attained",
            "nearest_adversary",
            "closed_ball_robust",
            "radius_witness",
            "lipschitz",
        }:
            return False
        if report["schema"] != "hingelab-v1":
            return False
        raw = report["request"]
        layers, out, lo, hi, ref, rad = parse(raw)
        regions = mask_regions(raw)
        expected = [
            {
                "left": str(l),
                "right": str(r),
                "slope": str(a),
                "intercept": str(b),
                "activation": mask,
            }
            for l, r, a, b, mask in regions
        ]
        if json.dumps(report["cells"], sort_keys=True) != json.dumps(
            expected, sort_keys=True
        ):
            return False
        if not regions or regions[0][0] != lo or regions[-1][1] != hi:
            return False
        if any(x[1] != y[0] for x, y in zip(regions, regions[1:])):
            return False
        val = direct(layers, out, ref)
        label = int(val >= 0)
        if (
            report["reference_margin"] != str(val)
            or type(report["reference_class"]) is not int
            or report["reference_class"] != label
        ):
            return False
        if report["lipschitz"] != str(max(abs(x[2]) for x in regions)):
            return False
        points = {lo, hi}
        zeros = []
        for l, r, a, b, _ in regions:
            points.update((l, r))
            if a and l <= -b / a <= r:
                points.add(-b / a)
                zeros.append({"left": str(-b / a), "right": str(-b / a)})
            elif a == 0 and b == 0:
                zeros.append({"left": str(l), "right": str(r)})
        if report["zero_sets"] != zeros:
            return False
        points = sorted(points)
        atoms = [(p, p, True, True) for p in points]
        atoms += [(l, r, False, False) for l, r in zip(points, points[1:])]
        sets = report["adversarial_sets"]
        for s in sets:
            if (
                set(s) != {"left", "right", "left_closed", "right_closed"}
                or type(s["left_closed"]) is not bool
                or type(s["right_closed"]) is not bool
            ):
                return False
            l, r = F(s["left"]), F(s["right"])
            if s["left"] != str(l) or s["right"] != str(r):
                return False
            if not lo <= l <= r <= hi or l not in points or r not in points:
                return False
            if l == r and not (s["left_closed"] and s["right_closed"]):
                return False
        # Exact canonical disjointness. Touching components may remain separate
        # only if the shared endpoint is absent from both.
        for x, y in zip(sets, sets[1:]):
            if F(x["right"]) > F(y["left"]) or (
                F(x["right"]) == F(y["left"])
                and (x["right_closed"] or y["left_closed"])
            ):
                return False

        def member(x, s):
            l, r = F(s["left"]), F(s["right"])
            return (
                l < x < r or x == l and s["left_closed"] or x == r and s["right_closed"]
            )

        adverse = []
        for l, r, lc, rc in atoms:
            x = (l + r) / 2
            bad = int(direct(layers, out, x) >= 0) != label
            if sum(bool(member(x, s)) for s in sets) != int(bad):
                return False
            if bad:
                adverse.append((l, r, lc, rc))
        candidates = []
        for l, r, lc, rc in adverse:
            p = min(max(ref, l), r)
            att = (l < p < r) or (p == l and lc) or (p == r and rc)
            candidates.append((abs(p - ref), p, att))
        distance = min((d for d, p, a in candidates), default=None)
        nearest = [(p, a) for d, p, a in candidates if d == distance]
        attained = any(a for p, a in nearest) if nearest else None
        selected = min((p for p, a in nearest if a), default=None)
        if report["distance_infimum"] != (None if distance is None else str(distance)):
            return False
        if report["minimum_attained"] is not attained:
            return False
        if report["nearest_adversary"] != (None if selected is None else str(selected)):
            return False
        robust = distance is None or distance > rad or distance == rad and not attained
        if report["closed_ball_robust"] is not robust:
            return False
        witness = report["radius_witness"]
        if robust:
            return witness is None
        if not isinstance(witness, str):
            return False
        x = F(witness)
        if str(x) != witness:
            return False
        return (
            lo <= x <= hi
            and abs(x - ref) <= rad
            and int(direct(layers, out, x) >= 0) != label
        )
    except (
        ValueError,
        TypeError,
        KeyError,
        IndexError,
        ZeroDivisionError,
        OverflowError,
    ):
        return False

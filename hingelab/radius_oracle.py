"""Mask/atom oracle. No profile, reference, union or erosion generator import."""

from fractions import Fraction as F
import json
from .model import parse, q, direct, text
from .oracle import mask_regions


def radius_verify(report):
    try:
        raw = report["request"]
        if not isinstance(raw, dict) or set(raw) != {"network", "target_fraction"}:
            return False
        layers, out, lo, hi, _, _ = parse(raw["network"])
        target = q(raw["target_fraction"])
        if not 0 <= target <= 1:
            return False
        points = {lo, hi}
        for l, r, a, b, _ in mask_regions(raw["network"]):
            points.update([l, r])
            if a and l <= -b / a <= r:
                points.add(-b / a)
        pp = sorted(points)
        label = lambda x: int(direct(layers, out, x) >= 0)
        atoms = [(p, p, True, True, label(p)) for p in pp] + [
            (a, b, False, False, label((a + b) / 2)) for a, b in zip(pp, pp[1:])
        ]

        def measure(rad, cls):
            cuts = sorted(
                points | {x for p in pp for x in [p - rad, p + rad] if lo <= x <= hi}
            )

            def safe(x):
                c = label(x)
                if cls is not None and c != cls:
                    return False
                for a, b, ac, bc, d in atoms:
                    if c == d:
                        continue
                    u, v = max(a, x - rad), min(b, x + rad)
                    if u < v or (
                        u == v and (a < u < b or u == a and ac or u == b and bc)
                    ):
                        return False
                return True

            length = sum(
                (b - a for a, b in zip(cuts, cuts[1:]) if safe((a + b) / 2)), F(0)
            )
            return length, bool(length or any(safe(p) for p in cuts))

        # Any collision of an original/shifted critical reference boundary has
        # radius |p-q| or |p-q|/2. Their superset partitions all affine pieces.
        rr = sorted(
            {F(0), F(32)}
            | {
                abs(a - b) / d
                for a in pp
                for b in pp
                for d in [1, 2]
                if abs(a - b) / d <= 32
            }
        )
        cache = {}

        def at(r, cls):
            key = (r, cls)
            if key not in cache:
                cache[key] = measure(r, cls)
            return cache[key]

        def build(cls):
            ss = []
            exists = []
            for i, a in enumerate(rr):
                if at(a, cls)[1]:
                    exists.append([a, a, True, True])
                if i + 1 == len(rr):
                    continue
                b = rr[i + 1]
                u, v = (2 * a + b) / 3, (a + 2 * b) / 3
                lu, eu = at(u, cls)
                lv, ev = at(v, cls)
                m = (lv - lu) / (v - u)
                c = lu - m * u
                # Independent internal consistency checks at all cell endpoints
                # and midpoint, including exact extinction equality.
                if (
                    at(a, cls)[0] != m * a + c
                    or at(b, cls)[0] != m * b + c
                    or at((a + b) / 2, cls)[0] != m * (a + b) / 2 + c
                    or eu != ev
                ):
                    raise ValueError("oracle partition inconsistent")
                if ss and ss[-1]["slope"] == text(m) and ss[-1]["intercept"] == text(c):
                    ss[-1]["right"] = text(b)
                else:
                    ss.append(
                        dict(
                            left=text(a),
                            right=text(b),
                            slope=text(m),
                            intercept=text(c),
                        )
                    )
                if eu:
                    exists.append([a, b, False, False])
            # Ordered exact atom reconstruction, not the generator's union.
            joined = []
            for a, b, ac, bc in exists:
                if joined and a == joined[-1][1] and (ac or joined[-1][3]):
                    joined[-1][1] = b
                    joined[-1][3] = bc
                else:
                    joined.append([a, b, ac, bc])
            ee = [
                dict(left=text(a), right=text(b), left_closed=ac, right_closed=bc)
                for a, b, ac, bc in joined
            ]
            return ss, ee

        rows = []
        for cls in [0, 1]:
            ss, ee = build(cls)
            rows.append(
                dict(class_label=cls, length_segments=ss, existence_radius_regions=ee)
            )
        ss, ee = build(None)
        # Inverse query from independently reconstructed affine segments.
        goal = target * (hi - lo)
        candidates = []
        for s in ss:
            a, b, m, c = (F(s[k]) for k in ["left", "right", "slope", "intercept"])
            if m * a + c <= goal:
                candidates.append(a)
            if m and a <= (goal - c) / m <= b:
                candidates.append((goal - c) / m)
        expected = dict(
            schema="hingelab-radius-v1",
            request=raw,
            radius_domain=["0", "32"],
            domain_length=text(hi - lo),
            classes=rows,
            length_segments=ss,
            existence_radius_regions=ee,
            target_length=text(goal),
            first_radius_at_most=text(min(candidates)) if candidates else None,
        )
        return json.dumps(report, sort_keys=True, separators=(",", ":")) == json.dumps(
            expected, sort_keys=True, separators=(",", ":")
        )
    except (ValueError, TypeError, KeyError, ZeroDivisionError, OverflowError):
        return False

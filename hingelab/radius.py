"""Exact robust-length profiles and existence over radius [0,32]."""

from fractions import Fraction as F
from .model import parse, q, text
from .reference import reference_atlas


def request(raw):
    if not isinstance(raw, dict) or set(raw) != {"network", "target_fraction"}:
        raise ValueError("exact network and target_fraction keys required")
    parsed = parse(raw["network"])
    target = q(raw["target_fraction"])
    if not 0 <= target <= 1:
        raise ValueError("target fraction must be in [0,1]")
    return parsed, target


def segments(components):
    cuts = sorted(
        {F(0), F(32)}
        | {w / speed for w, speed, _ in components if speed and 0 < w / speed < 32}
    )
    result = []
    for a, b in zip(cuts, cuts[1:]):
        mid = (a + b) / 2
        active = [(w, s) for w, s, _ in components if w - s * mid > 0]
        slope = -sum((s for _, s in active), F(0))
        intercept = sum((w for w, _ in active), F(0))
        if (
            result
            and result[-1]["slope"] == text(slope)
            and result[-1]["intercept"] == text(intercept)
        ):
            result[-1]["right"] = text(b)
        else:
            result.append(
                dict(
                    left=text(a),
                    right=text(b),
                    slope=text(slope),
                    intercept=text(intercept),
                )
            )
    return result


def existence(components):
    if not components:
        return []
    if any(not s or w / s > 32 for w, s, _ in components):
        end, closed = F(32), True
    else:
        end = max(w / s for w, s, _ in components)
        closed = any(w / s == end and included for w, s, included in components)
    return [dict(left="0", right=text(end), left_closed=True, right_closed=closed)]


def first_at_most(ss, target):
    for s in ss:
        a, b, m, c = (F(s[k]) for k in ["left", "right", "slope", "intercept"])
        if m * a + c <= target:
            return text(a)
        if m < 0 and m * b + c <= target:
            return text((target - c) / m)
    return None


def radius_profile(raw):
    (_, _, lo, hi, _, _), target = request(raw)
    base = reference_atlas(raw["network"])
    components, rows = [], []
    for row in base["classes"]:
        cs = []
        for s in row["regions"]:
            l, r = F(s["left"]), F(s["right"])
            speed = F(
                int(not (l == lo and s["left_closed"]))
                + int(not (r == hi and s["right_closed"]))
            )
            cs.append((r - l, speed, s["left_closed"] and s["right_closed"]))
        rows.append(
            dict(
                class_label=row["class_label"],
                length_segments=segments(cs),
                existence_radius_regions=existence(cs),
            )
        )
        components.extend(cs)
    ss = segments(components)
    return dict(
        schema="hingelab-radius-v1",
        request=raw,
        radius_domain=["0", "32"],
        domain_length=text(hi - lo),
        classes=rows,
        length_segments=ss,
        existence_radius_regions=existence(components),
        target_length=text(target * (hi - lo)),
        first_radius_at_most=first_at_most(ss, target * (hi - lo)),
    )

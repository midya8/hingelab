"""Exact closed-ball robustness for every reference in the declared domain."""

from fractions import Fraction as F
from .model import parse, text
from .atlas import atlas


def union(parts):
    out = []
    for l, r, lc, rc in sorted(parts):
        if l > r or (l == r and not (lc and rc)):
            continue
        if out and (l < out[-1][1] or (l == out[-1][1] and (lc or out[-1][3]))):
            a, b, ac, bc = out[-1]
            out[-1] = (a, max(b, r), ac, rc if r > b else bc or (rc and r == b))
        else:
            out.append((l, r, bool(lc), bool(rc)))
    return out


def encoded(parts):
    return [
        dict(left=text(l), right=text(r), left_closed=lc, right_closed=rc)
        for l, r, lc, rc in parts
    ]


def reference_atlas(raw):
    _, _, lo, hi, _, radius = parse(raw)
    base = atlas(raw)
    classes = [[], []]
    for c in base["cells"]:
        l, r, a, b = (F(c[k]) for k in ["left", "right", "slope", "intercept"])
        cuts = sorted({l, r} | ({-b / a} if a and l < -b / a < r else set()))
        for u in cuts:
            classes[int(a * u + b >= 0)].append((u, u, True, True))
        for u, v in zip(cuts, cuts[1:]):
            classes[int(a * (u + v) / 2 + b >= 0)].append((u, v, False, False))
    rows = []
    for label, parts in enumerate(classes):
        parts = union(parts)
        robust = []
        for l, r, lc, rc in parts:
            # An included domain edge has no adversaries beyond it. Other
            # boundaries move inward by radius with the original inclusion flag.
            u = l if l == lo and lc else l + radius
            v = r if r == hi and rc else r - radius
            robust.append((u, v, lc, rc))
        robust = union(robust)
        rows.append(
            dict(
                class_label=label,
                regions=encoded(parts),
                robust_regions=encoded(robust),
                class_length=text(sum((r - l for l, r, _, _ in parts), F(0))),
                robust_length=text(sum((r - l for l, r, _, _ in robust), F(0))),
            )
        )
    length = sum((F(row["robust_length"]) for row in rows), F(0))
    return dict(
        schema="hingelab-reference-v1",
        request=raw,
        classes=rows,
        domain_length=text(hi - lo),
        robust_length=text(length),
        robust_fraction=text(length / (hi - lo)),
    )

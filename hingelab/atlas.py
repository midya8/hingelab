"""Exact forward splitting, not sampled inference."""

from fractions import Fraction as F
from .model import parse, direct, text


def atlas(raw):
    layers, out, lo, hi, ref, rad = parse(raw)
    pieces = [(lo, hi, [(F(1), F(0))], [])]
    for weights, bias in layers:
        nxt = []
        for l, r, prev, masks in pieces:
            aff = [
                (
                    sum(w * a for w, (a, b) in zip(row, prev)),
                    c + sum(w * b for w, (a, b) in zip(row, prev)),
                )
                for row, c in zip(weights, bias)
            ]
            cuts = sorted({l, r} | {-b / a for a, b in aff if a and l < -b / a < r})
            for u, v in zip(cuts, cuts[1:]):
                mid = (u + v) / 2
                bits = [int(a * mid + b > 0) for a, b in aff]
                # Exactly zero preactivations are canonical inactive.
                vals = [ab if bit else (F(0), F(0)) for ab, bit in zip(aff, bits)]
                nxt.append((u, v, vals, masks + [bits]))
        pieces = nxt
    cells = []
    for l, r, vals, masks in pieces:
        w, b = out
        a = sum(z * x for z, (x, y) in zip(w, vals))
        c = b + sum(z * y for z, (x, y) in zip(w, vals))
        cells.append(
            {
                "left": text(l),
                "right": text(r),
                "slope": text(a),
                "intercept": text(c),
                "activation": masks,
            }
        )
    return finish(
        raw,
        cells,
        [
            (F(c["left"]), F(c["right"]), F(c["slope"]), F(c["intercept"]))
            for c in cells
        ],
        direct(layers, out, ref),
        lo,
        hi,
        ref,
        rad,
    )


def finish(raw, cells, segments, value, lo, hi, ref, rad):
    label = int(value >= 0)
    bad = []
    zeros = []
    for l, r, a, b in segments:
        if a == 0:
            if b == 0:
                zeros.append({"left": text(l), "right": text(r)})
            if int(b >= 0) != label:
                bad.append((l, r, True, True))
            continue
        root = -b / a
        if l <= root <= r:
            zeros.append({"left": text(root), "right": text(root)})
        cuts = sorted({l, r} | ({root} if l < root < r else set()))
        for u, v in zip(cuts, cuts[1:]):
            if int(a * ((u + v) / 2) + b >= 0) != label:
                bad.append(
                    (u, v, int(a * u + b >= 0) != label, int(a * v + b >= 0) != label)
                )
        # A root can be an isolated opposite-class tie (class 1).
        if label == 0 and l <= root <= r:
            bad.append((root, root, True, True))
    # Canonical disjoint union of adverse intervals, preserving endpoint topology.
    merged = []
    for l, r, lc, rc in sorted(bad):
        if merged and (
            l < merged[-1][1] or (l == merged[-1][1] and (lc or merged[-1][3]))
        ):
            u, v, uc, vc = merged[-1]
            if r > v:
                merged[-1] = (u, r, uc, rc)
            elif r == v:
                merged[-1] = (u, v, uc, vc or rc)
        else:
            merged.append((l, r, lc, rc))
    candidates = []
    for l, r, lc, rc in merged:
        p = min(max(ref, l), r)
        att = (l < p < r) or (p == l and lc) or (p == r and rc)
        candidates.append((abs(p - ref), p, att, l, r, lc, rc))
    dist = min((x[0] for x in candidates), default=None)
    near = [x for x in candidates if x[0] == dist]
    attained = any(x[2] for x in near) if near else None
    selected = min((x[1] for x in near if x[2]), default=None)
    unsafe = dist is not None and (dist < rad or (dist == rad and attained))
    witness = None
    if unsafe:
        for l, r, lc, rc in merged:
            u = max(l, ref - rad)
            v = min(r, ref + rad)
            if u < v:
                witness = (u + v) / 2
                break
            if u == v and ((l < u < r) or (u == l and lc) or (u == r and rc)):
                witness = u
                break
        assert witness is not None
    return {
        "schema": "hingelab-v1",
        "request": raw,
        "reference_margin": text(value),
        "reference_class": label,
        "cells": cells,
        "zero_sets": zeros,
        "adversarial_sets": [
            {
                "left": text(l),
                "right": text(r),
                "left_closed": bool(lc),
                "right_closed": bool(rc),
            }
            for l, r, lc, rc in merged
        ],
        "distance_infimum": None if dist is None else text(dist),
        "minimum_attained": attained,
        "nearest_adversary": None if selected is None else text(selected),
        "closed_ball_robust": not unsafe,
        "radius_witness": None if witness is None else text(witness),
        "lipschitz": text(max(abs(a) for l, r, a, b in segments)),
    }

"""Strict bounded rational network contract shared by generator and verifier."""

from fractions import Fraction
import re


def q(x):
    if isinstance(x, float) and x.is_integer():
        x = int(x)
    if (
        isinstance(x, bool)
        or not isinstance(x, (int, str))
        or (isinstance(x, str) and not re.fullmatch(r"[-+]?[0-9]+(?:/[0-9]+)?", x))
    ):
        raise ValueError("rationals must be integers or fraction strings")
    try:
        r = Fraction(x)
    except (ValueError, ZeroDivisionError):
        raise ValueError("invalid rational") from None
    if abs(r) > 32 or r.denominator > 1024:
        raise ValueError("rational outside bounded contract")
    return r


def parse(raw):
    if not isinstance(raw, dict) or set(raw) != {
        "layers",
        "output",
        "domain",
        "reference",
        "radius",
    }:
        raise ValueError("exact request keys required")
    if not isinstance(raw["layers"], list) or not 1 <= len(raw["layers"]) <= 2:
        raise ValueError("one or two hidden layers required")
    layers = []
    n = 1
    for layer in raw["layers"]:
        if not isinstance(layer, dict) or set(layer) != {"weights", "bias"}:
            raise ValueError("invalid layer")
        w, b = layer["weights"], layer["bias"]
        if (
            not isinstance(w, list)
            or not 1 <= len(w) <= 3
            or not isinstance(b, list)
            or len(w) != len(b)
        ):
            raise ValueError("width must be 1..3")
        if any(not isinstance(row, list) or len(row) != n for row in w):
            raise ValueError("weight shape mismatch")
        layers.append(([[q(x) for x in row] for row in w], [q(x) for x in b]))
        n = len(b)
    o = raw["output"]
    if (
        not isinstance(o, dict)
        or set(o) != {"weights", "bias"}
        or not isinstance(o["weights"], list)
        or len(o["weights"]) != n
    ):
        raise ValueError("invalid output shape")
    output = ([q(x) for x in o["weights"]], q(o["bias"]))
    d = raw["domain"]
    if not isinstance(d, list) or len(d) != 2:
        raise ValueError("domain requires two endpoints")
    lo, hi = map(q, d)
    ref = q(raw["reference"])
    rad = q(raw["radius"])
    if not lo < hi or not lo <= ref <= hi or rad < 0:
        raise ValueError("invalid domain, reference or radius")
    return layers, output, lo, hi, ref, rad


def direct(layers, output, x):
    v = [x]
    for w, b in layers:
        v = [
            max(Fraction(0), sum(a * z for a, z in zip(row, v)) + c)
            for row, c in zip(w, b)
        ]
    w, b = output
    return sum(a * z for a, z in zip(w, v)) + b


def text(x):
    return str(x)

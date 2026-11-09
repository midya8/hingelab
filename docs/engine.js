/* Exact rational arithmetic. No binary floating-point decision or root finding. */
const gcd = (a, b) => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
const Q = (n, d = 1n) => {
  n = BigInt(n);
  d = BigInt(d);
  if (!d) throw Error("zero denominator");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return [n / g, d / g];
};
const zero = Q(0),
  one = Q(1),
  add = (a, b) => Q(a[0] * b[1] + b[0] * a[1], a[1] * b[1]),
  neg = (a) => Q(-a[0], a[1]),
  sub = (a, b) => add(a, neg(b)),
  mul = (a, b) => Q(a[0] * b[0], a[1] * b[1]),
  div = (a, b) => Q(a[0] * b[1], a[1] * b[0]),
  cmp = (a, b) =>
    a[0] * b[1] < b[0] * a[1] ? -1 : a[0] * b[1] > b[0] * a[1] ? 1 : 0,
  eq = (a, b) => cmp(a, b) === 0,
  min = (a, b) => (cmp(a, b) < 0 ? a : b),
  max = (a, b) => (cmp(a, b) > 0 ? a : b),
  abs = (a) => (a[0] < 0n ? neg(a) : a),
  mid = (a, b) => div(add(a, b), Q(2)),
  txt = (a) => (a[1] === 1n ? String(a[0]) : `${a[0]}/${a[1]}`),
  sum = (a) => a.reduce(add, zero),
  unique = (a) => [...new Map(a.map((x) => [txt(x), x])).values()].sort(cmp);
const keys = (o, ks) =>
  o &&
  typeof o === "object" &&
  !Array.isArray(o) &&
  Object.keys(o).sort().join(",") === [...ks].sort().join(",");
function rational(x) {
  if (
    !(Number.isInteger(x) && typeof x === "number") &&
    !(typeof x === "string" && /^[-+]?[0-9]+(?:\/[0-9]+)?$/.test(x))
  )
    throw Error("use integers or fraction strings");
  const p = String(x).split("/"),
    r = Q(p[0], p[1] ?? 1);
  if (cmp(abs(r), Q(32)) > 0 || r[1] > 1024n)
    throw Error("rational outside bounded contract");
  return r;
}
function parse(raw) {
  if (!keys(raw, ["layers", "output", "domain", "reference", "radius"]))
    throw Error("exact request keys required");
  if (
    !Array.isArray(raw.layers) ||
    raw.layers.length < 1 ||
    raw.layers.length > 2
  )
    throw Error("one or two hidden layers required");
  let n = 1;
  const layers = raw.layers.map((l) => {
    if (
      !keys(l, ["weights", "bias"]) ||
      !Array.isArray(l.weights) ||
      !Array.isArray(l.bias) ||
      l.weights.length < 1 ||
      l.weights.length > 3 ||
      l.bias.length !== l.weights.length ||
      l.weights.some((row) => !Array.isArray(row) || row.length !== n)
    )
      throw Error("invalid layer shape");
    n = l.bias.length;
    return [l.weights.map((row) => row.map(rational)), l.bias.map(rational)];
  });
  if (
    !keys(raw.output, ["weights", "bias"]) ||
    !Array.isArray(raw.output.weights) ||
    raw.output.weights.length !== n
  )
    throw Error("invalid output shape");
  const output = [raw.output.weights.map(rational), rational(raw.output.bias)];
  if (!Array.isArray(raw.domain) || raw.domain.length !== 2)
    throw Error("two domain endpoints required");
  const [lo, hi] = raw.domain.map(rational),
    ref = rational(raw.reference),
    rad = rational(raw.radius);
  if (
    cmp(lo, hi) >= 0 ||
    cmp(lo, ref) > 0 ||
    cmp(ref, hi) > 0 ||
    cmp(rad, zero) < 0
  )
    throw Error("invalid domain, reference or radius");
  return { layers, output, lo, hi, ref, rad };
}
const affine = (ab, x) => add(mul(ab[0], x), ab[1]);
function evaluate(layers, [w, b], x) {
  let v = [x];
  for (const [weights, bias] of layers)
    v = weights.map((row, i) =>
      max(zero, add(sum(row.map((a, j) => mul(a, v[j]))), bias[i])),
    );
  return add(sum(w.map((a, j) => mul(a, v[j]))), b);
}
export function atlas(raw) {
  const {
    layers,
    output: [w, b],
    lo,
    hi,
    ref,
    rad,
  } = parse(raw);
  let pieces = [{ l: lo, r: hi, prev: [[one, zero]], masks: [] }];
  for (const [weights, bias] of layers) {
    const next = [];
    for (const { l, r, prev, masks } of pieces) {
      const forms = weights.map((row, i) => [
        sum(row.map((a, j) => mul(a, prev[j][0]))),
        add(bias[i], sum(row.map((a, j) => mul(a, prev[j][1])))),
      ]);
      const roots = forms
          .filter(([a]) => a[0] !== 0n)
          .map(([a, b]) => div(neg(b), a))
          .filter((x) => cmp(l, x) < 0 && cmp(x, r) < 0),
        cuts = unique([l, r, ...roots]);
      for (let i = 0; i < cuts.length - 1; i++) {
        const u = cuts[i],
          v = cuts[i + 1],
          bits = forms.map((ab) =>
            Number(cmp(affine(ab, mid(u, v)), zero) > 0),
          );
        next.push({
          l: u,
          r: v,
          prev: forms.map((ab, j) => (bits[j] ? ab : [zero, zero])),
          masks: [...masks, bits],
        });
      }
    }
    pieces = next;
  }
  const segments = pieces.map(({ l, r, prev, masks }) => ({
      l,
      r,
      a: sum(w.map((z, j) => mul(z, prev[j][0]))),
      b: add(b, sum(w.map((z, j) => mul(z, prev[j][1])))),
      masks,
    })),
    cells = segments.map(({ l, r, a, b, masks }) => ({
      left: txt(l),
      right: txt(r),
      slope: txt(a),
      intercept: txt(b),
      activation: masks,
    }));
  const value = evaluate(layers, [w, b], ref),
    label = Number(cmp(value, zero) >= 0),
    bad = [],
    zeros = [];
  for (const { l, r, a, b } of segments) {
    if (a[0] === 0n) {
      if (b[0] === 0n) zeros.push({ left: txt(l), right: txt(r) });
      if (Number(cmp(b, zero) >= 0) !== label) bad.push([l, r, true, true]);
      continue;
    }
    const root = div(neg(b), a);
    if (cmp(l, root) <= 0 && cmp(root, r) <= 0)
      zeros.push({ left: txt(root), right: txt(root) });
    const cuts = unique([
      l,
      r,
      ...(cmp(l, root) < 0 && cmp(root, r) < 0 ? [root] : []),
    ]);
    for (let i = 0; i < cuts.length - 1; i++) {
      const u = cuts[i],
        v = cuts[i + 1];
      if (Number(cmp(affine([a, b], mid(u, v)), zero) >= 0) !== label)
        bad.push([
          u,
          v,
          Number(cmp(affine([a, b], u), zero) >= 0) !== label,
          Number(cmp(affine([a, b], v), zero) >= 0) !== label,
        ]);
    }
    if (label === 0 && cmp(l, root) <= 0 && cmp(root, r) <= 0)
      bad.push([root, root, true, true]);
  }
  bad.sort(
    (x, y) =>
      cmp(x[0], y[0]) ||
      cmp(x[1], y[1]) ||
      Number(x[2]) - Number(y[2]) ||
      Number(x[3]) - Number(y[3]),
  );
  const merged = [];
  for (const [l, r, lc, rc] of bad) {
    const prev = merged.at(-1);
    if (prev && (cmp(l, prev[1]) < 0 || (eq(l, prev[1]) && (lc || prev[3])))) {
      if (cmp(r, prev[1]) > 0) {
        prev[1] = r;
        prev[3] = rc;
      } else if (eq(r, prev[1])) prev[3] ||= rc;
    } else merged.push([l, r, lc, rc]);
  }
  const candidates = merged.map(([l, r, lc, rc]) => {
    const p = min(max(ref, l), r),
      att =
        (cmp(l, p) < 0 && cmp(p, r) < 0) ||
        (eq(p, l) && lc) ||
        (eq(p, r) && rc);
    return [abs(sub(p, ref)), p, att];
  });
  const distance = candidates.length
      ? candidates.map((x) => x[0]).reduce(min)
      : null,
    near = candidates.filter((x) => distance !== null && eq(x[0], distance)),
    attained = near.length ? near.some((x) => x[2]) : null,
    selected =
      near
        .filter((x) => x[2])
        .map((x) => x[1])
        .sort(cmp)[0] ?? null,
    unsafe =
      distance !== null &&
      (cmp(distance, rad) < 0 || (eq(distance, rad) && attained));
  let witness = null;
  if (unsafe) {
    for (const [l, r, lc, rc] of merged) {
      const u = max(l, sub(ref, rad)),
        v = min(r, add(ref, rad));
      if (cmp(u, v) < 0) {
        witness = mid(u, v);
        break;
      }
      if (
        eq(u, v) &&
        ((cmp(l, u) < 0 && cmp(u, r) < 0) ||
          (eq(u, l) && lc) ||
          (eq(u, r) && rc))
      ) {
        witness = u;
        break;
      }
    }
    if (witness === null) throw Error("witness failure");
  }
  return {
    schema: "hingelab-v1",
    request: raw,
    reference_margin: txt(value),
    reference_class: label,
    cells,
    zero_sets: zeros,
    adversarial_sets: merged.map(([l, r, lc, rc]) => ({
      left: txt(l),
      right: txt(r),
      left_closed: lc,
      right_closed: rc,
    })),
    distance_infimum: distance === null ? null : txt(distance),
    minimum_attained: attained,
    nearest_adversary: selected === null ? null : txt(selected),
    closed_ball_robust: !unsafe,
    radius_witness: witness === null ? null : txt(witness),
    lipschitz: txt(segments.map((x) => abs(x.a)).reduce(max)),
  };
}

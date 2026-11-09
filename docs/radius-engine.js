import { Q, add, sub, mul, div, cmp, eq, txt, parse } from "./engine.js";
import { referenceAtlas } from "./reference-engine.js";
const rat = (x) => {
    const p = String(x).split("/");
    return Q(p[0], p[1] ?? 1);
  },
  Z = Q(0),
  H = Q(32);
function request(raw) {
  if (
    !raw ||
    Array.isArray(raw) ||
    typeof raw !== "object" ||
    Object.keys(raw).sort().join(",") !== "network,target_fraction"
  )
    throw Error("Exact network and target_fraction keys required");
  parse(raw.network);
  // Apply the existing strict scalar parser to the target too.
  parse({ ...raw.network, radius: raw.target_fraction });
  const t = rat(raw.target_fraction);
  if (cmp(t, Z) < 0 || cmp(t, Q(1)) > 0)
    throw Error("Target fraction must be in [0,1]");
  return t;
}
function segments(cs) {
  const cuts = [Z, H];
  for (const [w, s] of cs)
    if (!eq(s, Z)) {
      const c = div(w, s);
      if (cmp(c, Z) > 0 && cmp(c, H) < 0) cuts.push(c);
    }
  cuts.sort(cmp);
  const unique = cuts.filter((c, i) => !i || !eq(c, cuts[i - 1])),
    ss = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const a = unique[i],
      b = unique[i + 1],
      mid = div(add(a, b), Q(2)),
      active = cs.filter(([w, s]) => cmp(sub(w, mul(s, mid)), Z) > 0),
      m = sub(
        Z,
        active.reduce((a, [, s]) => add(a, s), Z),
      ),
      c = active.reduce((a, [w]) => add(a, w), Z),
      last = ss.at(-1);
    if (last && last.slope === txt(m) && last.intercept === txt(c))
      last.right = txt(b);
    else
      ss.push({
        left: txt(a),
        right: txt(b),
        slope: txt(m),
        intercept: txt(c),
      });
  }
  return ss;
}
function existence(cs) {
  if (!cs.length) return [];
  let end = H,
    closed = true;
  if (!cs.some(([w, s]) => eq(s, Z) || cmp(div(w, s), H) > 0)) {
    end = cs
      .map(([w, s]) => div(w, s))
      .sort(cmp)
      .at(-1);
    closed = cs.some(([w, s, c]) => eq(div(w, s), end) && c);
  }
  return [
    { left: "0", right: txt(end), left_closed: true, right_closed: closed },
  ];
}
export function radiusProfile(raw) {
  const target = request(raw),
    [lo, hi] = raw.network.domain.map(rat),
    base = referenceAtlas(raw.network),
    components = [];
  const classes = base.classes.map((row) => {
    const cs = row.regions.map((s) => {
      const l = rat(s.left),
        r = rat(s.right),
        speed = Q(
          Number(!(eq(l, lo) && s.left_closed)) +
            Number(!(eq(r, hi) && s.right_closed)),
        );
      return [sub(r, l), speed, s.left_closed && s.right_closed];
    });
    components.push(...cs);
    return {
      class_label: row.class_label,
      length_segments: segments(cs),
      existence_radius_regions: existence(cs),
    };
  });
  const ss = segments(components),
    length = sub(hi, lo),
    goal = mul(target, length);
  let first = null;
  for (const s of ss) {
    const [a, b, m, c] = ["left", "right", "slope", "intercept"].map((k) =>
      rat(s[k]),
    );
    if (cmp(add(mul(m, a), c), goal) <= 0) {
      first = txt(a);
      break;
    }
    if (cmp(m, Z) < 0 && cmp(add(mul(m, b), c), goal) <= 0) {
      first = txt(div(sub(goal, c), m));
      break;
    }
  }
  return {
    schema: "hingelab-radius-v1",
    request: raw,
    radius_domain: ["0", "32"],
    domain_length: txt(length),
    classes,
    length_segments: ss,
    existence_radius_regions: existence(components),
    target_length: txt(goal),
    first_radius_at_most: first,
  };
}

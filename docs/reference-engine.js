import {
  atlas,
  Q,
  add,
  sub,
  mul,
  div,
  cmp,
  eq,
  mid,
  txt,
  parse,
} from "./engine.js";
const rat = (x) => {
    const p = String(x).split("/");
    return Q(p[0], p[1] ?? 1);
  },
  union = (parts) => {
    const out = [];
    parts.sort(
      (a, b) =>
        cmp(a[0], b[0]) || cmp(a[1], b[1]) || Number(a[2]) - Number(b[2]),
    );
    for (const [l, r, lc, rc] of parts) {
      if (cmp(l, r) > 0 || (eq(l, r) && !(lc && rc))) continue;
      const last = out.at(-1);
      if (
        last &&
        (cmp(l, last[1]) < 0 || (eq(l, last[1]) && (lc || last[3])))
      ) {
        const c = cmp(r, last[1]);
        if (c > 0) {
          last[1] = r;
          last[3] = rc;
        } else if (c === 0) last[3] ||= rc;
      } else out.push([l, r, lc, rc]);
    }
    return out;
  },
  encode = (ss) =>
    ss.map(([l, r, lc, rc]) => ({
      left: txt(l),
      right: txt(r),
      left_closed: lc,
      right_closed: rc,
    })),
  length = (ss) => ss.reduce((s, [l, r]) => add(s, sub(r, l)), Q(0));
export function referenceAtlas(raw) {
  parse(raw);
  const [lo, hi] = raw.domain.map(rat),
    radius = rat(raw.radius),
    classes = [[], []],
    base = atlas(raw);
  for (const cell of base.cells) {
    const [l, r, a, b] = ["left", "right", "slope", "intercept"].map((k) =>
      rat(cell[k]),
    );
    const root = eq(a, Q(0)) ? null : div(sub(Q(0), b), a),
      cuts = [l, r];
    if (root && cmp(l, root) < 0 && cmp(root, r) < 0) cuts.splice(1, 0, root);
    for (const p of cuts)
      classes[cmp(add(mul(a, p), b), Q(0)) >= 0 ? 1 : 0].push([
        p,
        p,
        true,
        true,
      ]);
    for (let i = 0; i < cuts.length - 1; i++) {
      const u = cuts[i],
        v = cuts[i + 1];
      classes[cmp(add(mul(a, mid(u, v)), b), Q(0)) >= 0 ? 1 : 0].push([
        u,
        v,
        false,
        false,
      ]);
    }
  }
  const rows = classes.map((pieces, class_label) => {
      const parts = union(pieces),
        robust = union(
          parts.map(([l, r, lc, rc]) => [
            eq(l, lo) && lc ? l : add(l, radius),
            eq(r, hi) && rc ? r : sub(r, radius),
            lc,
            rc,
          ]),
        );
      return {
        class_label,
        regions: encode(parts),
        robust_regions: encode(robust),
        class_length: txt(length(parts)),
        robust_length: txt(length(robust)),
      };
    }),
    total = rows.reduce((a, row) => add(a, rat(row.robust_length)), Q(0));
  return {
    schema: "hingelab-reference-v1",
    request: raw,
    classes: rows,
    domain_length: txt(sub(hi, lo)),
    robust_length: txt(total),
    robust_fraction: txt(div(total, sub(hi, lo))),
  };
}

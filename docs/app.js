import { atlas } from "./engine.js";
const $ = (id) => document.getElementById(id),
  controls = await (await fetch("./controls.json")).json(),
  num = (s) => {
    const p = String(s).split("/");
    return Number(p[0]) / Number(p[1] || 1);
  },
  fmt = (c) =>
    `${c.left_closed ? "[" : "("}${c.left}, ${c.right}${c.right_closed ? "]" : ")"}`,
  text = (tag, t, cls) => {
    const n = document.createElement(tag);
    n.textContent = t;
    if (cls) n.className = cls;
    return n;
  };
for (const [i, c] of controls.entries()) {
  $("control").append(new Option(c.label, i));
}
function clear() {
  $("output").hidden = true;
  $("download").disabled = true;
  $("error").textContent = "";
  window.hingeReport = null;
  window.hingeCell = null;
  for (const id of ["cells", "sets", "cell-detail", "metrics", "plot"])
    $(id).replaceChildren();
}
function select(i) {
  const r = window.hingeReport;
  if (!r) return;
  window.hingeCell = i;
  $("cell").value = i;
  const c = r.cells[i];
  $("cell-detail").replaceChildren(
    text("p", `Region ${i + 1}: [${c.left}, ${c.right}]`),
    text("p", `Margin = (${c.slope}) × x + (${c.intercept})`),
    ...c.activation.map((m, k) =>
      text(
        "p",
        `Hidden layer ${k + 1}: ${m.map((b) => (b ? "on" : "off")).join(" · ")}`,
      ),
    ),
  );
  for (const [n, e] of [...$("cells").children].entries())
    e.classList.toggle("selected", n === i);
  draw(r, i);
}
function draw(r, index) {
  const svg = $("plot");
  svg.replaceChildren();
  const ns = "http://www.w3.org/2000/svg",
    node = (tag, attrs) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      svg.append(e);
      return e;
    },
    lo = num(r.request.domain[0]),
    hi = num(r.request.domain[1]),
    ys = r.cells.flatMap((c) => [
      num(c.slope) * num(c.left) + num(c.intercept),
      num(c.slope) * num(c.right) + num(c.intercept),
    ]),
    mn = Math.min(0, ...ys),
    mx = Math.max(0, ...ys),
    pad = Math.max(0.5, (mx - mn) * 0.12),
    bottom = mn - pad,
    top = mx + pad,
    X = (x) => 55 + (590 * (x - lo)) / (hi - lo),
    Y = (y) => 290 - (240 * (y - bottom)) / (top - bottom);
  node("rect", {
    x: X(num(r.cells[index].left)),
    y: 35,
    width: X(num(r.cells[index].right)) - X(num(r.cells[index].left)),
    height: 255,
    fill: "#f4efec",
  });
  node("line", {
    x1: 55,
    y1: Y(0),
    x2: 645,
    y2: Y(0),
    stroke: "#b9b6b7",
    "stroke-dasharray": "4 4",
  });
  for (const c of r.cells) {
    node("line", {
      x1: X(num(c.left)),
      x2: X(num(c.left)),
      y1: 35,
      y2: 290,
      stroke: "#eae9ea",
    });
    node("line", {
      x1: X(num(c.left)),
      y1: Y(num(c.slope) * num(c.left) + num(c.intercept)),
      x2: X(num(c.right)),
      y2: Y(num(c.slope) * num(c.right) + num(c.intercept)),
      stroke: "#251f21",
      "stroke-width": 3,
    });
  }
  node("circle", {
    cx: X(num(r.request.reference)),
    cy: Y(num(r.reference_margin)),
    r: 6,
    fill: "#337c68",
  });
  for (const x of [lo, (lo + hi) / 2, hi]) {
    const t = node("text", {
      x: X(x),
      y: 318,
      "text-anchor": "middle",
      "font-size": 16,
      fill: "#585254",
    });
    t.textContent = x;
  }
  for (const y of [mn, mx].filter((y, i, a) => a.indexOf(y) === i)) {
    const t = node("text", {
      x: 48,
      y: Y(y) + 5,
      "text-anchor": "end",
      "font-size": 14,
      fill: "#585254",
    });
    t.textContent = Number(y.toPrecision(4));
  }
  const t = node("text", {
    x: 350,
    y: 343,
    "text-anchor": "middle",
    "font-size": 15,
    fill: "#585254",
  });
  t.textContent = "Scalar input x";
  $("plot-caption").textContent =
    `Domain [${r.request.domain.join(", ")}]. Selected region shaded. Reference x = ${r.request.reference}, exact margin ${r.reference_margin}.`;
}
function run() {
  clear();
  try {
    const r = atlas(JSON.parse($("input").value));
    window.hingeReport = r;
    $("output").hidden = false;
    $("download").disabled = false;
    $("verdict").textContent = r.closed_ball_robust
      ? "This closed ball is robust."
      : "This closed ball contains an adversary.";
    $("explanation").textContent =
      r.distance_infimum === null
        ? "There is no opposite-class point anywhere in the declared domain."
        : r.minimum_attained
          ? `The nearest opposite-class point is attained at x = ${r.nearest_adversary}. Its distance is ${r.distance_infimum}.`
          : `The opposite-class distance has infimum ${r.distance_infimum}, but no nearest opposite-class point attains it. The requested radius ${r.request.radius} ${r.closed_ball_robust ? "does not include any opposite-class point" : `includes the actual witness x = ${r.radius_witness}`}.`;
    for (const [v, l] of [
      [r.reference_class, "Reference class"],
      [r.distance_infimum ?? "absent", "Distance infimum"],
      [
        r.minimum_attained === null
          ? "not applicable"
          : r.minimum_attained
            ? "yes"
            : "no",
        "Minimum attained",
      ],
      [r.radius_witness ?? "none", "Witness inside radius"],
    ]) {
      const d = text("div", "", "metric");
      d.append(text("strong", String(v)), text("small", l));
      $("metrics").append(d);
    }
    $("cell").replaceChildren();
    $("cells").replaceChildren();
    r.cells.forEach((c, i) => {
      $("cell").append(
        new Option(`Region ${i + 1}: ${c.left} to ${c.right}`, i),
      );
      const d = text("div", "", "cell"),
        b = text("button", `Region ${i + 1}: [${c.left}, ${c.right}]`);
      b.onclick = () => select(i);
      d.append(
        b,
        text("p", `Margin = (${c.slope}) × x + (${c.intercept})`),
        text(
          "p",
          c.activation.map((m, k) => `L${k + 1}: ${m.join("")}`).join(" | "),
          "caption",
        ),
      );
      $("cells").append(d);
    });
    if (r.adversarial_sets.length)
      for (const s of r.adversarial_sets)
        $("sets").append(text("div", fmt(s), "set"));
    else $("sets").append(text("p", "Empty set."));
    $("zero").textContent =
      `Exact domain Lipschitz constant: ${r.lipschitz}. Zero witnesses: ${r.zero_sets.length ? r.zero_sets.map((s) => `[${s.left}, ${s.right}]`).join(" ∪ ") : "none"}.`;
    select(0);
  } catch (e) {
    clear();
    $("error").textContent = e.message;
  }
}
$("control").onchange = () => {
  $("input").value = JSON.stringify(
    controls[Number($("control").value)].input,
    null,
    2,
  );
  run();
};
$("cell").onchange = () => select(Number($("cell").value));
$("input").oninput = clear;
$("run").onclick = run;
$("download").onclick = () => {
  if (!window.hingeReport) return;
  const blob = new Blob([JSON.stringify(window.hingeReport, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "hingelab-atlas.json";
  a.click();
  URL.revokeObjectURL(url);
};
$("control").dispatchEvent(new Event("change"));

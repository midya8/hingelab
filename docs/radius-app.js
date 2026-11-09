import { radiusProfile } from "./radius-engine.js";
const $ = (id) => document.getElementById(id),
  controls = await (await fetch("controls.json")).json(),
  num = (s) => {
    const p = String(s).split("/");
    return Number(p[0]) / Number(p[1] ?? 1);
  },
  interval = (s) =>
    `${s.left_closed ? "[" : "("}${s.left}, ${s.right}${s.right_closed ? "]" : ")"}`,
  sets = (ss) => (ss.length ? ss.map(interval).join(" ∪ ") : "∅");
let report = null;
window.radiusReport = null;
function text(tag, s) {
  const e = document.createElement(tag);
  e.textContent = s;
  return e;
}
function stale() {
  report = null;
  window.radiusReport = null;
  $("output").hidden = true;
  $("download").disabled = true;
  $("error").textContent = "";
}
for (let i = 0; i < controls.length; i++) {
  const o = text("option", controls[i].label);
  o.value = i;
  $("control").append(o);
}
function plot(id, end) {
  const svg = $(id),
    W = 760,
    H = 320,
    L = 65,
    R = 25,
    T = 25,
    B = 55,
    domain = num(report.domain_length),
    x = (r) => L + (num(r) / end) * (W - L - R),
    y = (v) => H - B - (v / domain) * (H - T - B),
    ns = "http://www.w3.org/2000/svg";
  svg.replaceChildren();
  const el = (tag, attrs, body) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (body !== undefined) e.textContent = body;
    svg.append(e);
    return e;
  };
  for (let i = 0; i <= 4; i++) {
    const r = (end * i) / 4,
      v = (domain * i) / 4;
    el("line", { x1: L, y1: y(v), x2: W - R, y2: y(v), stroke: "#dedbd5" });
    el(
      "text",
      {
        x: L - 10,
        y: y(v) + 4,
        "text-anchor": "end",
        "font-size": 13,
        fill: "#43515a",
      },
      v.toPrecision(3),
    );
    el(
      "text",
      {
        x: x(r),
        y: H - B + 24,
        "text-anchor": "middle",
        "font-size": 13,
        fill: "#43515a",
      },
      r.toPrecision(3),
    );
  }
  el(
    "text",
    {
      x: W - R,
      y: H - 8,
      "text-anchor": "end",
      "font-size": 14,
      fill: "#43515a",
    },
    "radius r",
  );
  const colors = ["#be683f", "#327c83", "#142d36"],
    rows = [
      ...report.classes.map((c) => c.length_segments),
      report.length_segments,
    ];
  rows.forEach((ss, j) => {
    const pts = [];
    for (const s of ss) {
      const a = num(s.left),
        b = Math.min(end, num(s.right));
      if (a > end) continue;
      const m = num(s.slope),
        c = num(s.intercept);
      pts.push(`${x(a)},${y(m * a + c)}`, `${x(b)},${y(m * b + c)}`);
    }
    el("polyline", {
      points: pts.join(" "),
      fill: "none",
      stroke: colors[j],
      "stroke-width": j === 2 ? 3 : 2,
      "stroke-dasharray": j === 2 ? "" : "7 4",
      "data-series": j,
    });
  });
}
function run() {
  stale();
  try {
    const network = JSON.parse($("input").value);
    report = radiusProfile({ network, target_fraction: $("target").value });
    window.radiusReport = report;
    $("output").hidden = false;
    $("download").disabled = false;
    $("verdict").textContent =
      report.first_radius_at_most === null
        ? "This length target is not reached."
        : `First target radius: ${report.first_radius_at_most}`;
    $("explanation").textContent =
      report.first_radius_at_most === null
        ? "No radius in [0, 32] reduces robust length to this target. This statement is limited to the declared domain and horizon."
        : `At radius ${report.first_radius_at_most}, robust length is at most ${report.target_length}. This is a length threshold, not a claim that all robust references have disappeared.`;
    $("metrics").replaceChildren();
    for (const [label, v] of [
      ["Domain length", report.domain_length],
      ["Target length", report.target_length],
      ["Total affine pieces", report.length_segments.length],
      ["First radius ≤ target", report.first_radius_at_most ?? "unattained"],
    ]) {
      const e = document.createElement("div");
      e.className = "metric";
      e.append(text("strong", v), text("small", label));
      $("metrics").append(e);
    }
    const breaks = report.length_segments.slice(0, -1).map((s) => num(s.right)),
      detail = breaks.length ? Math.min(32, Math.max(...breaks) * 1.2) : 1;
    plot("plot", detail || 1);
    plot("full-plot", 32);
    $("plot-caption").textContent =
      `Total: solid dark line. Class 0: dashed rust. Class 1: dashed teal. Detail radius ends at ${detail.toPrecision(4)} (display only); full horizon ends at exactly 32.`;
    $("classes").replaceChildren();
    for (const c of report.classes) {
      const e = document.createElement("article");
      e.append(
        text("h3", `Class ${c.class_label}`),
        text("p", `${c.length_segments.length} exact length piece(s).`),
        text(
          "p",
          `A robust reference exists at radii ${sets(c.existence_radius_regions)}.`,
        ),
      );
      $("classes").append(e);
    }
    $("pieces").replaceChildren();
    for (const s of report.length_segments) {
      const tr = document.createElement("tr");
      for (const v of [`[${s.left}, ${s.right}]`, s.slope, s.intercept])
        tr.append(text("td", v));
      $("pieces").append(tr);
    }
    $("existence").replaceChildren(
      text("h3", "Existence is not length"),
      text(
        "p",
        `At least one robust reference exists at radii ${sets(report.existence_radius_regions)}. An included right endpoint may retain only a zero-length singleton. Parentheses exclude the extinction radius.`,
      ),
    );
  } catch (e) {
    stale();
    $("error").textContent = e.message;
  }
}
function control() {
  stale();
  $("input").value = JSON.stringify(
    controls[Number($("control").value)].input,
    null,
    2,
  );
  run();
}
$("control").addEventListener("change", control);
$("target").addEventListener("input", run);
$("input").addEventListener("input", stale);
$("run").addEventListener("click", run);
$("download").addEventListener("click", () => {
  if (!report) return;
  const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "hingelab-radius.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
control();

import { referenceAtlas } from "./reference-engine.js";
import { atlas } from "./engine.js";
const $ = (id) => document.getElementById(id),
  controls = await (await fetch("controls.json")).json();
const interval = (s) =>
    `${s.left_closed ? "[" : "("}${s.left}, ${s.right}${s.right_closed ? "]" : ")"}`,
  list = (ss) => (ss.length ? ss.map(interval).join(" ∪ ") : "∅"),
  number = (s) => {
    const p = String(s).split("/");
    return Number(p[0]) / Number(p[1] ?? 1);
  };
let report = null,
  components = [];
window.referenceReport = null;
window.referenceRegion = null;
for (let i = 0; i < controls.length; i++) {
  const o = document.createElement("option");
  o.value = i;
  o.textContent = controls[i].label;
  $("control").append(o);
}
function stale() {
  report = null;
  window.referenceReport = null;
  window.referenceRegion = null;
  $("output").hidden = true;
  $("download").disabled = true;
  $("components").replaceChildren();
  $("region").replaceChildren();
  $("classes").replaceChildren();
  $("error").textContent = "";
}
function text(tag, body) {
  const e = document.createElement(tag);
  e.textContent = body;
  return e;
}
function metric(label, value) {
  const e = document.createElement("div");
  e.className = "metric";
  e.append(text("strong", value), text("small", label));
  $("metrics").append(e);
}
function select(i) {
  window.referenceRegion = i;
  const c = components[i];
  $("region").value = i;
  $("region-detail").replaceChildren();
  if (!c) {
    $("region-detail").append(
      text("p", "No robust reference component exists at this radius."),
    );
    return;
  }
  $("region-detail").append(
    text("h3", `Class ${c.label} · ${interval(c.s)}`),
    text(
      "p",
      c.s.left === c.s.right
        ? "One exact robust reference survives. Its interval length is zero, not its existence."
        : `Every point in this component is robust. Left endpoint: ${c.s.left_closed ? "included" : "excluded"}. Right endpoint: ${c.s.right_closed ? "included" : "excluded"}.`,
    ),
  );
  [...$("components").children].forEach((b, j) =>
    b.classList.toggle("selected", i === j),
  );
}
function plot(raw) {
  const svg = $("plot"),
    ns = "http://www.w3.org/2000/svg";
  svg.replaceChildren();
  const [lo, hi] = raw.domain.map(number),
    X = (x) => 110 + ((number(x) - lo) / (hi - lo)) * 600;
  function shape(tag, attrs) {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.append(e);
    return e;
  }
  for (const row of report.classes) {
    const c = row.class_label,
      color = c ? "#337c68" : "#9a503b",
      y = 60 + c * 125;
    shape("text", {
      x: 14,
      y: y + 8,
      fill: color,
      "font-size": 18,
    }).textContent = `Class ${c}`;
    for (const [sets, dy, wide] of [
      [row.regions, 0, 3],
      [row.robust_regions, 35, 9],
    ])
      for (const s of sets) {
        const attrs = { stroke: color, "stroke-width": wide };
        shape("line", {
          x1: X(s.left),
          x2: X(s.right),
          y1: y + dy,
          y2: y + dy,
          ...attrs,
          "data-set": dy ? "robust" : "class",
        });
        for (const [p, closed] of [
          [s.left, s.left_closed],
          [s.right, s.right_closed],
        ])
          shape("circle", {
            cx: X(p),
            cy: y + dy,
            r: 6,
            fill: closed ? color : "#faf9f8",
            stroke: color,
            "stroke-width": 2,
          });
      }
  }
  shape("text", {
    x: 110,
    y: 280,
    fill: "#585254",
    "font-size": 15,
  }).textContent = String(raw.domain[0]);
  shape("text", {
    x: 710,
    y: 280,
    "text-anchor": "end",
    fill: "#585254",
    "font-size": 15,
  }).textContent = String(raw.domain[1]);
  const xp = X(raw.reference);
  shape("line", {
    x1: xp,
    x2: xp,
    y1: 30,
    y2: 240,
    stroke: "#585254",
    "stroke-dasharray": "4 4",
    "stroke-width": 1,
  });
  $("plot-caption").textContent =
    `Radius ${raw.radius}. Dashed line: request reference ${raw.reference}. Exact endpoint values appear in the class cards and component inspector.`;
}
function run() {
  stale();
  try {
    const raw = JSON.parse($("input").value);
    report = referenceAtlas(raw);
    window.referenceReport = report;
    $("radius").value = raw.radius;
    const point = atlas(raw);
    $("output").hidden = false;
    $("download").disabled = false;
    $("verdict").textContent =
      `Robust interval length: ${report.robust_length} of ${report.domain_length}.`;
    $("explanation").textContent =
      `At the request reference ${raw.reference}, class ${point.reference_class}, the closed ball is ${point.closed_ball_robust ? "robust" : "not robust"}.${point.radius_witness !== null ? ` An actual opposite-class point in this ball is ${point.radius_witness}.` : ""} This reference does not change the atlas.`;
    $("metrics").replaceChildren();
    metric("Radius", String(raw.radius));
    metric("Robust length / domain length", report.robust_fraction);
    metric("Exact arithmetic", "Rational");
    components = [];
    for (const row of report.classes) {
      const e = document.createElement("article");
      e.append(
        text("h3", `Class ${row.class_label}`),
        text("p", `Original set: ${list(row.regions)}`),
        text("p", `Robust references: ${list(row.robust_regions)}`),
        text(
          "p",
          `Length ${row.robust_length} robust / ${row.class_length} in class.`,
        ),
      );
      $("classes").append(e);
      for (const s of row.robust_regions) {
        const i = components.length;
        components.push({ label: row.class_label, s });
        const o = document.createElement("option");
        o.value = i;
        o.textContent = `Class ${row.class_label}: ${interval(s)}`;
        $("region").append(o);
        const b = text("button", `Class ${row.class_label} · ${interval(s)}`);
        b.type = "button";
        b.onclick = () => select(i);
        $("components").append(b);
      }
    }
    $("region").disabled = !components.length;
    select(components.length ? 0 : null);
    plot(raw);
  } catch (e) {
    stale();
    $("error").textContent = e.message;
  }
}
function load() {
  const raw = controls[Number($("control").value)].input;
  $("input").value = JSON.stringify(raw, null, 2);
  $("radius").value = raw.radius;
  run();
}
$("control").onchange = load;
$("input").oninput = stale;
$("run").onclick = run;
$("region").onchange = () => select(Number($("region").value));
$("radius").oninput = () => {
  const value = $("radius").value;
  stale();
  try {
    const raw = JSON.parse($("input").value);
    raw.radius = value;
    $("input").value = JSON.stringify(raw, null, 2);
    run();
  } catch (e) {
    $("error").textContent = e.message;
  }
};
$("download").onclick = () => {
  if (!report) return;
  const u = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = u;
  a.download = "hingelab-reference.json";
  a.click();
  URL.revokeObjectURL(u);
};
$("control").value = 7;
load();

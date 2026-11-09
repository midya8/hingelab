import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { referenceAtlas } from "../docs/reference-engine.js";
const controls = JSON.parse(
  readFileSync(new URL("../docs/controls.json", import.meta.url)),
);
test("complete exact reference reports, 72 controls plus 128 seeded two-layer networks", () => {
  const inputs = controls.flatMap((c) =>
    [0, "1/1024", "1/4", "1/2", "3/4", 1, "3/2", 4, 32].map((radius) => ({
      ...c.input,
      radius,
    })),
  );
  let seed = 9183;
  const rand = (n) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    },
    q = () => rand(7) - 3;
  for (let i = 0; i < 128; i++) {
    const n = 1 + rand(3),
      m = 1 + rand(3);
    inputs.push({
      layers: [
        {
          weights: Array.from({ length: n }, () => [q()]),
          bias: Array.from({ length: n }, q),
        },
        {
          weights: Array.from({ length: m }, () =>
            Array.from({ length: n }, q),
          ),
          bias: Array.from({ length: m }, q),
        },
      ],
      output: { weights: Array.from({ length: m }, q), bias: q() },
      domain: [-2, 2],
      reference: 0,
      radius: `${rand(9)}/4`,
    });
  }
  const reports = inputs.map(referenceAtlas);
  const native = JSON.parse(
    execFileSync(
      process.env.PYTHON || "python",
      [
        "-c",
        "import sys,json;from hingelab.reference import reference_atlas;print(json.dumps([reference_atlas(r) for r in json.load(sys.stdin)]))",
      ],
      { input: JSON.stringify(inputs), maxBuffer: 32 << 20 },
    ),
  );
  assert.deepEqual(reports, native);
  execFileSync(
    process.env.PYTHON || "python",
    [
      "-c",
      "import sys,json;from hingelab.reference_oracle import reference_verify;assert all(reference_verify(r) for r in json.load(sys.stdin))",
    ],
    { input: JSON.stringify(reports), maxBuffer: 32 << 20 },
  );
  console.log(JSON.stringify({ completeReferenceReports: reports.length }));
});
test("reference changes do not change all-reference sets; radius zero includes isolated tie", () => {
  const a = referenceAtlas(controls[0].input),
    b = referenceAtlas({ ...controls[0].input, reference: -1 });
  assert.deepEqual(a.classes, b.classes);
  const r = referenceAtlas({ ...controls[2].input, radius: 0 });
  assert.deepEqual(r.classes[1].regions, r.classes[1].robust_regions);
  assert.equal(r.robust_fraction, "1");
  assert.throws(() => referenceAtlas({ ...controls[0].input, radius: -1 }));
});

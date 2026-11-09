import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { atlas } from "../docs/engine.js";
const controls = JSON.parse(
  readFileSync(new URL("../docs/controls.json", import.meta.url)),
);
test("exact complete cross-language rational reports and independent oracle", () => {
  const inputs = controls.flatMap((c) => [
    c.input,
    ...[0, "1/2", 1, "3/2", 2].map((radius) => ({ ...c.input, radius })),
  ]);
  const native = JSON.parse(
    execFileSync(
      process.env.PYTHON || "python",
      [
        "-c",
        "import sys,json;from hingelab import atlas;print(json.dumps([atlas(r) for r in json.load(sys.stdin)]))",
      ],
      { input: JSON.stringify(inputs), maxBuffer: 16 << 20 },
    ),
  );
  const reports = inputs.map(atlas);
  assert.deepEqual(reports, native);
  execFileSync(
    process.env.PYTHON || "python",
    [
      "-c",
      "import sys,json;from hingelab.oracle import verify;assert all(verify(r) for r in json.load(sys.stdin))",
    ],
    { input: JSON.stringify(reports), maxBuffer: 16 << 20 },
  );
  console.log(JSON.stringify({ completeReports: reports.length }));
});
test("strict malformed input rejection", () => {
  for (const raw of [
    {},
    { ...controls[0].input, radius: 0.1 },
    { ...controls[0].input, extra: 1 },
    { ...controls[0].input, reference: 33 },
    { ...controls[0].input, domain: [2, -2] },
  ])
    assert.throws(() => atlas(raw));
});

test("seeded two-layer exact cross-language exhaustion", () => {
  let seed = 9182;
  const rand = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  const inputs = [];
  for (let i = 0; i < 96; i++) {
    const n = 1 + rand(3),
      m = 1 + rand(3),
      r = () => rand(7) - 3;
    inputs.push({
      layers: [
        {
          weights: Array.from({ length: n }, () => [r()]),
          bias: Array.from({ length: n }, r),
        },
        {
          weights: Array.from({ length: m }, () =>
            Array.from({ length: n }, r),
          ),
          bias: Array.from({ length: m }, r),
        },
      ],
      output: { weights: Array.from({ length: m }, r), bias: r() },
      domain: [-2, 2],
      reference: `${rand(9) - 4}/2`,
      radius: `${rand(7)}/2`,
    });
  }
  const native = JSON.parse(
      execFileSync(
        process.env.PYTHON || "python",
        [
          "-c",
          "import sys,json;from hingelab import atlas;print(json.dumps([atlas(r) for r in json.load(sys.stdin)]))",
        ],
        { input: JSON.stringify(inputs), maxBuffer: 16 << 20 },
      ),
    ),
    reports = inputs.map(atlas);
  assert.deepEqual(reports, native);
  execFileSync(
    process.env.PYTHON || "python",
    [
      "-c",
      "import sys,json;from hingelab.oracle import verify;assert all(verify(r) for r in json.load(sys.stdin))",
    ],
    { input: JSON.stringify(reports), maxBuffer: 16 << 20 },
  );
  console.log(JSON.stringify({ seededCompleteReports: reports.length }));
});

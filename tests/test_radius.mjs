import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { radiusProfile } from "../docs/radius-engine.js";
const controls = JSON.parse(
  readFileSync(new URL("../docs/controls.json", import.meta.url)),
);
test("complete exact profiles, 40 controls/targets and 64 seeded networks", () => {
  const inputs = controls.flatMap((c) =>
    ["0", "1/4", "1/2", "3/4", "1"].map((target_fraction) => ({
      network: c.input,
      target_fraction,
    })),
  );
  let seed = 27018;
  const rand = (n) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    },
    q = () => rand(7) - 3;
  for (let i = 0; i < 64; i++) {
    const n = 1 + rand(3),
      m = 1 + rand(3);
    inputs.push({
      network: {
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
        radius: 1,
      },
      target_fraction: `${rand(5)}/4`,
    });
  }
  const reports = inputs.map(radiusProfile),
    native = JSON.parse(
      execFileSync(
        process.env.PYTHON || "python",
        [
          "-c",
          "import sys,json;from hingelab.radius import radius_profile;print(json.dumps([radius_profile(r) for r in json.load(sys.stdin)]))",
        ],
        { input: JSON.stringify(inputs), maxBuffer: 32 << 20 },
      ),
    );
  assert.deepEqual(reports, native);
  execFileSync(
    process.env.PYTHON || "python",
    [
      "-c",
      "import sys,json;from hingelab.radius_oracle import radius_verify;assert all(radius_verify(r) for r in json.load(sys.stdin))",
    ],
    { input: JSON.stringify(reports), maxBuffer: 32 << 20 },
  );
  console.log(JSON.stringify({ completeRadiusReports: reports.length }));
});
test("radius input contract and invariant saved point settings", () => {
  const raw = { network: controls[0].input, target_fraction: "1/2" },
    a = radiusProfile(raw),
    b = radiusProfile({
      ...raw,
      network: { ...raw.network, reference: -1, radius: 32 },
    });
  assert.deepEqual(a.classes, b.classes);
  assert.deepEqual(a.length_segments, b.length_segments);
  for (const t of ["-1", "2", true, "1/1025", "0.5", null])
    assert.throws(() => radiusProfile({ ...raw, target_fraction: t }));
  assert.throws(() => radiusProfile({ ...raw, extra: 1 }));
});

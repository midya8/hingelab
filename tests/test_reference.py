import copy, json, random, unittest
from fractions import Fraction as F
from pathlib import Path
from unittest.mock import patch
from hingelab.reference import reference_atlas
from hingelab.reference_oracle import reference_verify
from hingelab.atlas import atlas

CONTROLS = json.loads(Path("docs/controls.json").read_text())


def inside(sets, x):
    return any(
        (F(s["left"]) < x < F(s["right"]))
        or (x == F(s["left"]) and s["left_closed"])
        or (x == F(s["right"]) and s["right_closed"])
        for s in sets
    )


class ReferenceTests(unittest.TestCase):
    def test_tie_asymmetry(self):
        r = reference_atlas(CONTROLS[0]["input"])
        self.assertTrue(reference_verify(r))
        self.assertEqual(
            r["classes"][0]["robust_regions"],
            [dict(left="-2", right="-1", left_closed=True, right_closed=False)],
        )
        self.assertEqual(
            r["classes"][1]["robust_regions"],
            [dict(left="1", right="2", left_closed=True, right_closed=True)],
        )
        self.assertEqual(r["robust_fraction"], "1/2")

    def test_all_controls_many_radii(self):
        for c in CONTROLS:
            for radius in ["0", "1/4", "1/2", "3/4", "1", "3/2", "2", "4", "32"]:
                raw = {**c["input"], "radius": radius}
                r = reference_atlas(raw)
                self.assertTrue(reference_verify(r), (c["label"], radius, r))
                if radius == "0":
                    for row in r["classes"]:
                        self.assertEqual(row["regions"], row["robust_regions"])
                    self.assertEqual(r["robust_fraction"], "1")

    def test_isolated_tie_loses_robustness_for_any_positive_radius(self):
        r = reference_atlas({**CONTROLS[2]["input"], "radius": "1/1024"})
        self.assertEqual(
            r["classes"][1]["regions"],
            [dict(left="0", right="0", left_closed=True, right_closed=True)],
        )
        self.assertEqual(r["classes"][1]["robust_regions"], [])
        self.assertTrue(reference_verify(r))

    def test_exact_singleton_at_halfwidth(self):
        raw = copy.deepcopy(CONTROLS[7]["input"])
        raw["radius"] = "1/2"
        r = reference_atlas(raw)
        self.assertEqual(
            r["classes"][1]["robust_regions"],
            [dict(left="0", right="0", left_closed=True, right_closed=True)],
        )
        self.assertTrue(reference_verify(r))
        self.assertEqual(
            reference_atlas({**raw, "radius": "513/1024"})["classes"][1][
                "robust_regions"
            ],
            [],
        )

    def test_domain_clipping_and_absent_class(self):
        for idx in [3, 6]:
            r = reference_atlas({**CONTROLS[idx]["input"], "radius": 32})
            self.assertEqual(r["robust_fraction"], "1")
            self.assertTrue(reference_verify(r))

    def test_forged_fields_and_types(self):
        r = reference_atlas(CONTROLS[0]["input"])
        for key in ["schema", "domain_length", "robust_length", "robust_fraction"]:
            b = copy.deepcopy(r)
            b[key] = "forged"
            self.assertFalse(reference_verify(b))
        for key, val in [
            ("class_label", 1),
            ("class_length", "0"),
            ("robust_length", "0"),
            ("regions", []),
            ("robust_regions", []),
        ]:
            b = copy.deepcopy(r)
            b["classes"][0][key] = val
            self.assertFalse(reference_verify(b))
        b = copy.deepcopy(r)
        b["classes"][0]["robust_regions"][0]["right_closed"] = True
        self.assertFalse(reference_verify(b))
        b = copy.deepcopy(r)
        b["classes"][0]["regions"][0]["left_closed"] = 1
        self.assertFalse(reference_verify(b))
        b = copy.deepcopy(r)
        b["extra"] = 1
        self.assertFalse(reference_verify(b))

    def test_generator_disabled(self):
        r = reference_atlas(CONTROLS[7]["input"])
        with (
            patch("hingelab.reference.reference_atlas", side_effect=RuntimeError),
            patch("hingelab.reference.union", side_effect=RuntimeError),
            patch("hingelab.reference.atlas", side_effect=RuntimeError),
        ):
            self.assertTrue(reference_verify(r))

    def test_seeded_networks_point_agreement_and_radius_monotonicity(self):
        rand = random.Random(9183)
        for _ in range(160):
            n, m = rand.randint(1, 3), rand.randint(1, 3)
            q = lambda: rand.randint(-3, 3)
            raw = dict(
                layers=[
                    dict(
                        weights=[[q()] for _ in range(n)], bias=[q() for _ in range(n)]
                    ),
                    dict(
                        weights=[[q() for _ in range(n)] for _ in range(m)],
                        bias=[q() for _ in range(m)],
                    ),
                ],
                output=dict(weights=[q() for _ in range(m)], bias=q()),
                domain=[-2, 2],
                reference=0,
                radius=f"{rand.randint(0,8)}/4",
            )
            report = reference_atlas(raw)
            self.assertTrue(reference_verify(report), raw)
            larger = reference_atlas({**raw, "radius": str(F(raw["radius"]) + F(1, 4))})
            self.assertTrue(reference_verify(larger))
            self.assertLessEqual(F(larger["robust_length"]), F(report["robust_length"]))
            for x in [F(k, 8) for k in range(-16, 17)]:
                point = atlas({**raw, "reference": str(x)})
                self.assertEqual(
                    inside(
                        report["classes"][point["reference_class"]]["robust_regions"], x
                    ),
                    point["closed_ball_robust"],
                )

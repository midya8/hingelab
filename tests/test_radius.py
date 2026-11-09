import copy, json, random, unittest
from fractions import Fraction as F
from pathlib import Path
from unittest.mock import patch
from hingelab.radius import radius_profile
from hingelab.radius_oracle import radius_verify
from hingelab.reference import reference_atlas

C = json.loads(Path("docs/controls.json").read_text())


def value(ss, x):
    for s in ss:
        if F(s["left"]) <= x <= F(s["right"]):
            return F(s["slope"]) * x + F(s["intercept"])
    raise AssertionError(x)


class RadiusTests(unittest.TestCase):
    def test_controls_and_targets(self):
        for c in C:
            for t in ["0", "1/4", "1/2", "3/4", "1"]:
                r = radius_profile(dict(network=c["input"], target_fraction=t))
                self.assertTrue(radius_verify(r), r)
                for rad in ["0", "1/2", "1", "2", "32"]:
                    p = reference_atlas({**c["input"], "radius": rad})
                    self.assertEqual(
                        value(r["length_segments"], F(rad)), F(p["robust_length"])
                    )
                x = r["first_radius_at_most"]
                if x is not None:
                    x = F(x)
                    self.assertLessEqual(
                        value(r["length_segments"], x), F(r["target_length"])
                    )
                    if x > 0:
                        self.assertGreater(
                            value(r["length_segments"], x / 2), F(r["target_length"])
                        )

    def test_tie_thresholds_and_zero_length(self):
        r = radius_profile(dict(network=C[0]["input"], target_fraction="0"))
        self.assertEqual(r["first_radius_at_most"], "2")
        self.assertEqual(
            r["classes"][0]["existence_radius_regions"],
            [dict(left="0", right="2", left_closed=True, right_closed=False)],
        )
        self.assertEqual(
            r["classes"][1]["existence_radius_regions"],
            [dict(left="0", right="2", left_closed=True, right_closed=True)],
        )
        self.assertTrue(radius_verify(r))
        r = radius_profile(dict(network=C[2]["input"], target_fraction="0"))
        self.assertEqual(
            r["classes"][1]["existence_radius_regions"],
            [dict(left="0", right="0", left_closed=True, right_closed=True)],
        )
        r = radius_profile(dict(network=C[7]["input"], target_fraction="0"))
        self.assertEqual(
            r["classes"][1]["existence_radius_regions"],
            [dict(left="0", right="1/2", left_closed=True, right_closed=True)],
        )

    def test_constant_unattained_and_one(self):
        for i in [3, 6]:
            r = radius_profile(dict(network=C[i]["input"], target_fraction="0"))
            self.assertIsNone(r["first_radius_at_most"])
            self.assertTrue(radius_verify(r))
            r = radius_profile(dict(network=C[i]["input"], target_fraction="1"))
            self.assertEqual(r["first_radius_at_most"], "0")

    def test_forgery_and_independence(self):
        r = radius_profile(dict(network=C[7]["input"], target_fraction="1/2"))
        for key in r:
            if key == "request":
                continue
            b = copy.deepcopy(r)
            b[key] = "forged"
            self.assertFalse(radius_verify(b))
        for key in ["length_segments", "existence_radius_regions"]:
            b = copy.deepcopy(r)
            b["classes"][1][key] = []
            self.assertFalse(radius_verify(b))
        b = copy.deepcopy(r)
        b["classes"][1]["existence_radius_regions"][0]["right_closed"] = 1
        self.assertFalse(radius_verify(b))
        with (
            patch("hingelab.radius.radius_profile", side_effect=RuntimeError),
            patch("hingelab.radius.reference_atlas", side_effect=RuntimeError),
            patch("hingelab.radius.segments", side_effect=RuntimeError),
        ):
            self.assertTrue(radius_verify(r))

    def test_invalid(self):
        raw = dict(network=C[0]["input"], target_fraction="1/2")
        for t in ["-1", "2", True, "1/1025", "0.5", None]:
            with self.assertRaises((ValueError, TypeError)):
                radius_profile({**raw, "target_fraction": t})
        for bad in [{}, {**raw, "extra": 0}]:
            with self.assertRaises(ValueError):
                radius_profile(bad)

    def test_seeded(self):
        rng = random.Random(27018)
        for _ in range(40):
            n, m = rng.randint(1, 3), rng.randint(1, 3)
            q = lambda: rng.randint(-3, 3)
            net = dict(
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
                radius=1,
            )
            r = radius_profile(
                dict(network=net, target_fraction=str(F(rng.randint(0, 4), 4)))
            )
            self.assertTrue(radius_verify(r), r)
            for rad in ["0", "1/4", "1/2", "1", "2", "4", "32"]:
                self.assertEqual(
                    value(r["length_segments"], F(rad)),
                    F(reference_atlas({**net, "radius": rad})["robust_length"]),
                )

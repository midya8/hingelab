import unittest, random, copy
from fractions import Fraction as F
from unittest.mock import patch
from hingelab import atlas
from hingelab.model import parse, direct
from hingelab.oracle import verify, mask_regions


def request(
    weights=[[1]], bias=[0], out=[1], offset=0, ref=-1, radius=1, domain=[-2, 2]
):
    return {
        "layers": [{"weights": weights, "bias": bias}],
        "output": {"weights": out, "bias": offset},
        "domain": domain,
        "reference": ref,
        "radius": radius,
    }


class AtlasTests(unittest.TestCase):
    def test_open_infimum(self):
        # margin x, represented by ReLU(x)-ReLU(-x); tie class1.
        r = atlas(request([[1], [-1]], [0, 0], [1, -1], ref=1))
        self.assertTrue(verify(r))
        self.assertEqual(r["distance_infimum"], "1")
        self.assertFalse(r["minimum_attained"])
        self.assertTrue(r["closed_ball_robust"])
        self.assertIsNone(r["nearest_adversary"])

    def test_attained_tie(self):
        r = atlas(request([[1], [-1]], [0, 0], [1, -1], ref=-1))
        self.assertTrue(verify(r))
        self.assertTrue(r["minimum_attained"])
        self.assertEqual(r["nearest_adversary"], "0")
        self.assertFalse(r["closed_ball_robust"])

    def test_isolated_tie(self):
        r = atlas(request([[1], [-1]], [0, 0], [-1, -1], ref=-1))
        self.assertTrue(verify(r))
        self.assertEqual(
            r["adversarial_sets"],
            [{"left": "0", "right": "0", "left_closed": True, "right_closed": True}],
        )

    def test_constant(self):
        r = atlas(request([[0]], [0], [0]))
        self.assertTrue(verify(r))
        self.assertIsNone(r["distance_infimum"])
        self.assertEqual(r["lipschitz"], "0")

    def test_plateau(self):
        r = atlas(request([[1]], [0], [1], ref=-1))
        self.assertTrue(verify(r))
        self.assertEqual(
            r["zero_sets"], [{"left": "-2", "right": "0"}, {"left": "0", "right": "0"}]
        )

    def test_radius_witness(self):
        r = atlas(request([[1], [-1]], [0, 0], [1, -1], ref=1, radius="3/2"))
        self.assertTrue(verify(r))
        self.assertIsNotNone(r["radius_witness"])

    def test_rational_boundary(self):
        r = atlas(request([[3]], [1], [1], offset=-1, ref="-1/2"))
        self.assertTrue(verify(r))
        self.assertIn("-1/3", [c["left"] for c in r["cells"]])

    def test_output_cancel_not_activation_merge(self):
        r = atlas(request([[1], [1]], [0, 0], [1, -1]))
        self.assertTrue(verify(r))
        self.assertEqual(len(r["cells"]), 2)

    def test_generator_disabled(self):
        r = atlas(request())
        with patch.object(
            __import__("importlib").import_module("hingelab.atlas"),
            "atlas",
            side_effect=AssertionError("disabled"),
        ):
            self.assertTrue(verify(r))

    def test_forgery(self):
        good = atlas(request([[1], [-1]], [0, 0], [1, -1], ref=1))
        for key, value in [
            ("distance_infimum", "0"),
            ("minimum_attained", True),
            ("closed_ball_robust", False),
            ("nearest_adversary", "0"),
            ("radius_witness", "-1"),
            ("lipschitz", "0"),
            ("zero_sets", []),
            ("adversarial_sets", []),
            ("reference_class", 0),
        ]:
            bad = copy.deepcopy(good)
            bad[key] = value
            self.assertFalse(verify(bad), key)
        bad = copy.deepcopy(good)
        bad["cells"][0]["slope"] = "7"
        self.assertFalse(verify(bad))

    def test_reject_inputs(self):
        for mutate in [
            lambda r: r.update(extra=0),
            lambda r: r.update(radius=-1),
            lambda r: r.update(reference=3),
            lambda r: r.update(domain=[1, 1]),
            lambda r: r["layers"][0].update(weights=[[True]]),
            lambda r: r.update(radius=0.1),
        ]:
            r = request()
            mutate(r)
            with self.assertRaises(ValueError):
                atlas(r)

    def test_random_two_layers(self):
        rng = random.Random(701)
        for _ in range(200):
            n = rng.randint(1, 3)
            m = rng.randint(1, 3)
            r = request(
                [[rng.randint(-3, 3)] for i in range(n)],
                [rng.randint(-3, 3) for i in range(n)],
                [rng.randint(-3, 3) for i in range(m)],
                rng.randint(-3, 3),
                ref=str(F(rng.randint(-4, 4), 2)),
                radius=str(F(rng.randint(0, 6), 2)),
            )
            r["layers"].append(
                {
                    "weights": [
                        [rng.randint(-3, 3) for i in range(n)] for j in range(m)
                    ],
                    "bias": [rng.randint(-3, 3) for j in range(m)],
                }
            )
            report = atlas(r)
            self.assertTrue(verify(report), r)
            layers, out, *_ = parse(r)
            for c in report["cells"]:
                l, u, a, b = map(F, [c["left"], c["right"], c["slope"], c["intercept"]])
                for x in [l, (2 * l + u) / 3, (l + 2 * u) / 3, u]:
                    self.assertEqual(a * x + b, direct(layers, out, x))


if __name__ == "__main__":
    unittest.main()

# HingeLab

A decision boundary is not always an adversary. Inspect every affine region of a small rational ReLU network, then check whether the distance to a different class is attained, only approached, or absent in the domain.

[Live inspector](https://midya8.github.io/hingelab/) · [Exact contract](CONTRACT.md) · [Implementation](hingelab/atlas.py) · [Independent checker](hingelab/oracle.py)

## What makes the example matter

Fix class 1 at margin ≥ 0 and class 0 otherwise. For margin(x) = x at reference x = 1, the opposite-class set is [-2, 0). Its distance has infimum 1, but no opposite-class point attains it. A closed ball of radius exactly 1 is robust. At reference x = -1, the tie x = 0 is an actual class change, so the same radius is not robust. A boundary alone does not decide robustness without the label convention and endpoint topology.

The controls include those two cases, an isolated opposite-class tie, a zero plateau, a larger-radius witness, rational activation knots, an output-cancelled hidden kink and a nested two-layer tent. Domain restriction is explicit.

## Exact implementation, separate evidence

- Forward interval splitting propagates affine forms with Python `Fraction`. The browser uses normalized `BigInt` fractions. No floating-point root search or sampled-grid certificate.
- Every cell retains its exact interval, output slope/intercept and canonical hidden activation mask on the open interior. Hidden kinks remain visible even when the scalar output cancels.
- Opposite-class intervals carry open/closed endpoint flags. The report separates a distance infimum from an attained minimum and from an actual witness inside the requested closed ball.
- The independent Python checker enumerates every activation mask, intersects its exact rational phase inequalities, checks coverage and formulas, and checks sign on every boundary atom and open interval. It imports neither the generator nor its set-construction function.
- The exact domain Lipschitz constant is the largest absolute output slope. This is not a product-of-weight-norm estimate.
- SVG coordinates are rounded for display only. Browser-generated evidence is not called independently checked until the Python checker accepts it.

## Reproduce

Python 3.10+ and no runtime dependencies:

```sh
python -m unittest discover -s tests -v
python -c 'import json; print(json.dumps(json.load(open("docs/controls.json"))[0]["input"]))' > /tmp/request.json
python -m hingelab atlas /tmp/request.json > /tmp/report.json
python -m hingelab verify /tmp/report.json
bash tools/check_wheel.sh
```

Node 22+ and Chrome:

```sh
npm test
python -m http.server 8000 --directory docs
```

Open the inspector at localhost:8000. The complete-report cross-language tests compare exact JSON, not approximate numeric fields. Browser tests inspect every region at 320, 390 and 1280 pixels, compare complete reports to Python, run the independent checker on all browser reports, and check download, stale clearing and malformed-input behavior. `CHROME_BIN` selects Chrome; `PYTHON` selects the Python executable. Installed module and console reproduction runs outside the checkout.

## Scope and attribution

One scalar input, one or two hidden ReLU layers of width 1..3, one scalar output margin, at most six hidden units. Parameters, endpoints, reference and radius are integers or rational strings with absolute value at most 32 and denominator at most 1,024. The exact contract describes grammar and topology. The checker enumerates at most 64 masks, not arbitrary networks. No training, model import, image classifier, high-dimensional certificate, speed/accuracy comparison or new-algorithm claim. No paid APIs or private data.

This bounded educational implementation uses established piecewise-affine network analysis. In particular, [Sotoudeh and Thakur, *Computing Linear Restrictions of Neural Networks* (NeurIPS 2019)](https://proceedings.neurips.cc/paper_files/paper/2019/file/908075ea2c025c335f4865f7db427062-Paper.pdf) develops exact line restrictions for much broader layer families. [Bunel et al., *Branch and Bound for Piecewise Linear Neural Network Verification* (JMLR 2020)](https://www.jmlr.org/papers/v21/19-468.html) studies general verification. HingeLab neither implements nor benchmarks those full systems. [Source notes](SOURCES.md) distinguish used facts from background.

MIT licensed.

"""Run from outside the checkout with an installed wheel."""

import json, subprocess, sys, tempfile
from pathlib import Path

controls = json.loads(Path(sys.argv[1]).read_text())
with tempfile.TemporaryDirectory() as tmp:
    for control in controls:
        request = Path(tmp) / "request.json"
        report = Path(tmp) / "report.json"
        request.write_text(json.dumps(control["input"]))
        module = subprocess.check_output(
            [sys.executable, "-m", "hingelab", "atlas", str(request)], cwd=tmp
        )
        console = subprocess.check_output(
            [str(Path(sys.executable).parent / "hingelab"), "atlas", str(request)],
            cwd=tmp,
        )
        assert json.loads(module) == json.loads(console)
        report.write_bytes(module)
        for command in [
            [sys.executable, "-m", "hingelab"],
            [str(Path(sys.executable).parent / "hingelab")],
        ]:
            assert json.loads(
                subprocess.check_output(command + ["verify", str(report)], cwd=tmp)
            ) == {"valid": True}
        broken = json.loads(module)
        broken["closed_ball_robust"] = not broken["closed_ball_robust"]
        report.write_text(json.dumps(broken))
        p = subprocess.run(
            [sys.executable, "-m", "hingelab", "verify", str(report)],
            capture_output=True,
            cwd=tmp,
        )
        assert p.returncode == 1 and json.loads(p.stdout) == {"valid": False}
print(
    f"Installed module and console: all {len(controls)} controls independently verified; forged reports rejected"
)

with tempfile.TemporaryDirectory() as tmp:
    for control in controls:
        request = Path(tmp) / "request.json"
        report = Path(tmp) / "report.json"
        request.write_text(json.dumps(control["input"]))
        module = subprocess.check_output(
            [sys.executable, "-m", "hingelab", "reference", str(request)], cwd=tmp
        )
        console = subprocess.check_output(
            [str(Path(sys.executable).parent / "hingelab"), "reference", str(request)],
            cwd=tmp,
        )
        assert json.loads(module) == json.loads(console)
        report.write_bytes(module)
        for command in [
            [sys.executable, "-m", "hingelab"],
            [str(Path(sys.executable).parent / "hingelab")],
        ]:
            assert json.loads(
                subprocess.check_output(
                    command + ["reference-verify", str(report)], cwd=tmp
                )
            ) == {"valid": True}
        broken = json.loads(module)
        broken["robust_fraction"] = "999"
        report.write_text(json.dumps(broken))
        p = subprocess.run(
            [sys.executable, "-m", "hingelab", "reference-verify", str(report)],
            capture_output=True,
            cwd=tmp,
        )
        assert p.returncode == 1 and json.loads(p.stdout) == {"valid": False}
print(
    f"Installed reference module and console: all {len(controls)} controls independently verified; forged reports rejected"
)

with tempfile.TemporaryDirectory() as tmp:
    for control in controls:
        request = Path(tmp) / "request.json"
        report = Path(tmp) / "report.json"
        request.write_text(
            json.dumps(dict(network=control["input"], target_fraction="1/2"))
        )
        module = subprocess.check_output(
            [sys.executable, "-m", "hingelab", "radius", str(request)], cwd=tmp
        )
        console = subprocess.check_output(
            [str(Path(sys.executable).parent / "hingelab"), "radius", str(request)],
            cwd=tmp,
        )
        assert json.loads(module) == json.loads(console)
        report.write_bytes(module)
        for command in [
            [sys.executable, "-m", "hingelab"],
            [str(Path(sys.executable).parent / "hingelab")],
        ]:
            assert json.loads(
                subprocess.check_output(
                    command + ["radius-verify", str(report)], cwd=tmp
                )
            ) == {"valid": True}
        broken = json.loads(module)
        broken["first_radius_at_most"] = "999"
        report.write_text(json.dumps(broken))
        p = subprocess.run(
            [sys.executable, "-m", "hingelab", "radius-verify", str(report)],
            capture_output=True,
            cwd=tmp,
        )
        assert p.returncode == 1 and json.loads(p.stdout) == {"valid": False}
print(
    f"Installed radius module and console: all {len(controls)} controls independently verified; forged reports rejected"
)

import argparse, json, sys
from .atlas import atlas
from .oracle import verify
from .reference import reference_atlas
from .reference_oracle import reference_verify
from .radius import radius_profile
from .radius_oracle import radius_verify


def main():
    p = argparse.ArgumentParser(description="Exact bounded one-dimensional ReLU atlas")
    p.add_argument(
        "command",
        choices=[
            "atlas",
            "verify",
            "reference",
            "reference-verify",
            "radius",
            "radius-verify",
        ],
    )
    p.add_argument("file", nargs="?", default="-")
    a = p.parse_args()
    try:
        raw = json.load(sys.stdin if a.file == "-" else open(a.file, encoding="utf8"))
        if a.command in ("atlas", "reference", "radius"):
            json.dump(
                {
                    "atlas": atlas,
                    "reference": reference_atlas,
                    "radius": radius_profile,
                }[a.command](raw),
                sys.stdout,
                indent=2,
            )
            print()
        else:
            valid = {
                "verify": verify,
                "reference-verify": reference_verify,
                "radius-verify": radius_verify,
            }[a.command](raw)
            print(json.dumps({"valid": valid}))
            return 0 if valid else 1
    except (ValueError, TypeError) as e:
        print(str(e), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

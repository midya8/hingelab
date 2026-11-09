import argparse, json, sys
from .atlas import atlas
from .oracle import verify
from .reference import reference_atlas
from .reference_oracle import reference_verify


def main():
    p = argparse.ArgumentParser(description="Exact bounded one-dimensional ReLU atlas")
    p.add_argument(
        "command", choices=["atlas", "verify", "reference", "reference-verify"]
    )
    p.add_argument("file", nargs="?", default="-")
    a = p.parse_args()
    try:
        raw = json.load(sys.stdin if a.file == "-" else open(a.file, encoding="utf8"))
        if a.command in ("atlas", "reference"):
            json.dump(
                (atlas if a.command == "atlas" else reference_atlas)(raw),
                sys.stdout,
                indent=2,
            )
            print()
        else:
            valid = (verify if a.command == "verify" else reference_verify)(raw)
            print(json.dumps({"valid": valid}))
            return 0 if valid else 1
    except (ValueError, TypeError) as e:
        print(str(e), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

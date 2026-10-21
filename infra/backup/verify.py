"""Compare a backup manifest with the manifest taken after a restore; exit 1 on any difference.
django_session is ignored (sign-ins between the two moments)."""

import json
import sys

IGNORED = {"django_session"}


def main(before_path: str, after_path: str) -> int:
    with open(before_path, encoding="utf-8") as f:
        before = json.load(f)
    with open(after_path, encoding="utf-8") as f:
        after = json.load(f)
    problems = [
        f"{t}: {before['tables'].get(t)} → {after['tables'].get(t)}"
        for t in sorted(set(before["tables"]) | set(after["tables"]))
        if t not in IGNORED and before["tables"].get(t) != after["tables"].get(t)
    ]
    if after["objects"] < before["objects"]:
        problems.append(f"objects: {before['objects']} → {after['objects']}")
    for p in problems:
        print(p)
    print("Pemulihan cocok dengan cadangan." if not problems else "Pemulihan TIDAK cocok.")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))

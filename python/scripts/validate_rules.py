"""Validate data/markham_rules.json against the schema in docs/SPEC.md §6.

Usage:
    python scripts/validate_rules.py                # default path: ../data/markham_rules.json
    python scripts/validate_rules.py other.json

Exit code 0 = valid, 1 = invalid.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field, TypeAdapter, ValidationError

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RULES_PATH = ROOT / "data" / "markham_rules.json"
TARGET_RULE_COUNT = 120

Stream = Literal[
    "blue_box",
    "green_bin",
    "garbage",
    "textile_bin",
    "recycling_depot",
    "hazardous_depot",
    "yard_waste",
    "bulky_pickup",
    "retailer_takeback",
]


class DisposalRule(BaseModel):
    item: str = Field(min_length=1)
    aliases: list[str]
    stream: Stream
    instructions: str = Field(min_length=1)
    reusable: bool
    reuse_suggestion: Optional[str] = None
    est_weight_g: int = Field(gt=0)
    # False until a human has checked the entry against markham.ca "What Goes Where".
    verified: bool = False


RULES_ADAPTER = TypeAdapter(list[DisposalRule])


def validate(path: Path) -> int:
    raw = json.loads(path.read_text(encoding="utf-8"))
    try:
        rules = RULES_ADAPTER.validate_python(raw)
    except ValidationError as exc:
        print(f"INVALID: {path}")
        print(exc)
        return 1

    names = Counter(r.item.strip().lower() for r in rules)
    duplicates = sorted(name for name, count in names.items() if count > 1)

    print(f"OK: {len(rules)} rules in {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")
    for stream, count in sorted(Counter(r.stream for r in rules).items(), key=lambda kv: -kv[1]):
        print(f"  {stream:<18} {count}")
    print(f"  reusable: {sum(r.reusable for r in rules)}")
    unverified = sum(not r.verified for r in rules)
    print(f"  verified: {len(rules) - unverified} / {len(rules)}" + (f"  (WARN: {unverified} still to check against markham.ca)" if unverified else ""))

    if duplicates:
        print(f"WARN: duplicate items: {', '.join(duplicates)}")
    if len(rules) < TARGET_RULE_COUNT:
        print(f"WARN: only {len(rules)} rules - spec asks for ~{TARGET_RULE_COUNT} (docs/SPEC.md section 6)")
    return 0


if __name__ == "__main__":
    target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_RULES_PATH
    sys.exit(validate(target))

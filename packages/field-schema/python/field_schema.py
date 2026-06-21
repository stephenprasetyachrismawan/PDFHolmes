"""Loader Python utk field-schema kanonik (packages/field-schema/fields.json).

Dipakai service `analyzer` agar prompt/validasi 48 field identik dgn sisi TS.
Tidak ada duplikasi definisi: JSON yang sama dibaca kedua bahasa.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

# fields.json ada satu direktori di atas folder python/
_JSON_PATH = Path(__file__).resolve().parent.parent / "fields.json"


@dataclass(frozen=True)
class FieldDef:
    key: str
    label: str
    group: str
    order: int
    auto: bool
    default_source: str
    prompt: str
    featured: bool = False
    optional: bool = False


@dataclass(frozen=True)
class FieldGroup:
    key: str
    label: str
    tab: str


@lru_cache(maxsize=1)
def _raw() -> dict:
    # Izinkan override path via env utk kontainer (lihat Dockerfile analyzer).
    import os

    override = os.getenv("FIELD_SCHEMA_PATH")
    path = Path(override) if override else _JSON_PATH
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def fields() -> list[FieldDef]:
    items = [
        FieldDef(
            key=f["key"],
            label=f["label"],
            group=f["group"],
            order=f["order"],
            auto=f.get("auto", False),
            default_source=f.get("defaultSource", "inferred"),
            prompt=f["prompt"],
            featured=f.get("featured", False),
            optional=f.get("optional", False),
        )
        for f in _raw()["fields"]
    ]
    return sorted(items, key=lambda x: x.order)


@lru_cache(maxsize=1)
def groups() -> list[FieldGroup]:
    return [
        FieldGroup(key=g["key"], label=g["label"], tab=g["tab"])
        for g in _raw()["groups"]
    ]


def field_keys() -> list[str]:
    return [f.key for f in fields()]


def embedding_dim() -> int:
    return int(_raw()["embeddingDim"])


def get_field(key: str) -> FieldDef | None:
    for f in fields():
        if f.key == key:
            return f
    return None

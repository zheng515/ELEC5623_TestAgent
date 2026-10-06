"""Versioned gold cases. Labels are scorer inputs, never model prompt inputs."""

import hashlib
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas import RepositorySnapshot, RequirementItem, TestScenario

DEFAULT_CORPUS = Path(__file__).with_name("cases.json")


class Rule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quote: str
    testable: bool
    ambiguous: bool


class AnalysisCase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    category: str
    specification: str
    rules: list[Rule]


class OracleCase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    category: str
    specification: str
    requirements: list[RequirementItem]
    scenario: TestScenario
    repository: RepositorySnapshot
    expected_verdict: Literal["supported", "contradicted", "insufficient"]


class Corpus(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    analysis: list[AnalysisCase]
    oracle: list[OracleCase]

    @model_validator(mode="after")
    def validate_sources(self):
        ids = [case.id for case in [*self.analysis, *self.oracle]]
        if len(ids) != len(set(ids)):
            raise ValueError("Evaluation case IDs must be unique.")
        for case in self.analysis:
            if not case.rules:
                raise ValueError(f"{case.id}: gold rules are required.")
            quotes = [rule.quote for rule in case.rules]
            if len(quotes) != len(set(quotes)):
                raise ValueError(f"{case.id}: gold rule quotes must be unique.")
            for quote in quotes:
                if not quote.strip() or case.specification.count(quote) != 1:
                    raise ValueError(f"{case.id}: gold quote must occur exactly once.")
        for case in self.oracle:
            ids = {item.id for item in case.requirements}
            if len(ids) != len(case.requirements) or not case.scenario.requirement_ids:
                raise ValueError(f"{case.id}: unique linked requirements are required.")
            if not set(case.scenario.requirement_ids) <= ids:
                raise ValueError(f"{case.id}: unknown linked requirement.")
            if case.scenario.check is None:
                raise ValueError(f"{case.id}: an exact oracle contract is required.")
            if case.scenario.oracle_grounding is not None:
                raise ValueError(f"{case.id}: cases cannot carry prior oracle approval.")
            for requirement in case.requirements:
                if not requirement.source_quote.strip() or (
                    requirement.source_quote not in case.specification
                ):
                    raise ValueError(f"{case.id}: requirement source is not original text.")
        return self


def load_corpus(path: Path = DEFAULT_CORPUS):
    raw = path.read_bytes()
    return Corpus.model_validate_json(raw), hashlib.sha256(raw).hexdigest()

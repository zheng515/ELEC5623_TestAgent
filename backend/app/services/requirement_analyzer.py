import re
from dataclasses import dataclass

from app.schemas import Behavior


@dataclass(frozen=True)
class RequirementAnalysis:
    behaviors: list[Behavior]
    evidence: list[dict[str, str]]


class RequirementAnalyzer:
    """Creates traceable behavior candidates without claiming verification."""

    _label = re.compile(r"^([A-Za-z]+[-_]?\d+)\s*[:.)-]\s*(.+)$")
    _bullet = re.compile(r"^(?:[-*•]|\d+[.)])\s+")
    _sentence_boundary = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")

    def analyze(self, requirements_text: str) -> RequirementAnalysis:
        behaviors: list[Behavior] = []
        evidence: list[dict[str, str]] = []

        for line_number, raw_line in enumerate(requirements_text.splitlines(), start=1):
            line = raw_line.strip()
            if not line:
                continue
            line = self._bullet.sub("", line)
            match = self._label.match(line)
            requirement_id = match.group(1).upper() if match else f"REQ-{line_number:03d}"
            content = match.group(2).strip() if match else line

            for segment_number, sentence in enumerate(
                self._sentence_boundary.split(content), start=1
            ):
                quote = sentence.strip()
                if not quote:
                    continue
                behavior_id = f"B-{len(behaviors) + 1:03d}"
                evidence_id = f"SRC-L{line_number}-S{segment_number}"
                behaviors.append(
                    Behavior(
                        id=behavior_id,
                        requirement_id=requirement_id,
                        source_quote=quote,
                        description=quote,
                        evidence_refs=[evidence_id],
                    )
                )
                evidence.append(
                    {
                        "id": evidence_id,
                        "type": "requirement_source",
                        "location": f"requirements.txt:{line_number}",
                        "quote": quote,
                    }
                )

        return RequirementAnalysis(behaviors=behaviors, evidence=evidence)

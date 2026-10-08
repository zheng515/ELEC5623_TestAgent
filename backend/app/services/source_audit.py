"""Audit exact quote provenance without claiming semantic completeness."""

import re

from app.schemas import (
    DocumentLocation,
    RequirementDocument,
    RequirementItem,
    SourceAnalysisAudit,
    SourceFragment,
    SourceLink,
)


def audit_source(
    source: str,
    requirements: list[RequirementItem],
    *,
    extraction_limit: int,
    returned_requirements: int,
    document: RequirementDocument | None = None,
) -> SourceAnalysisAudit:
    positions: dict[tuple[int, int], list[str]] = {}
    ambiguous = []
    for requirement in requirements:
        quote = requirement.source_quote
        # Lookahead includes overlapping occurrences. Repeated text cannot identify
        # which occurrence was analyzed; do not silently credit every occurrence.
        matches = list(re.finditer(f"(?={re.escape(quote)})", source)) if quote else []
        if len(matches) != 1:
            ambiguous.append(requirement.id)
            continue
        start = matches[0].start()
        positions.setdefault((start, start + len(quote)), []).append(requirement.id)
    links = [
        SourceLink(
            text=source[start:end],
            start=start,
            end=end,
            line=source.count("\n", 0, start) + 1,
            requirement_ids=ids,
        )
        for (start, end), ids in sorted(positions.items())
    ]
    fragments = []

    def record_gap(start: int, end: int):
        for match in re.finditer(r"[^\n]+", source[start:end]):
            text = match.group().strip()
            if not any(character.isalnum() for character in text):
                continue
            offset = start + match.start() + len(match.group()) - len(match.group().lstrip())
            fragments.append(
                SourceFragment(
                    text=text,
                    start=offset,
                    end=offset + len(text),
                    line=source.count("\n", 0, offset) + 1,
                )
            )

    cursor = 0
    for link in links:
        if link.start > cursor:
            record_gap(cursor, link.start)
        cursor = max(cursor, link.end)
    record_gap(cursor, len(source))
    issues = []
    if fragments:
        issues.append(
            f"{len(fragments)} source fragments have no unambiguous requirement quote link. "
            "They may contain omitted rules or contextual text; they have not been verified."
        )
    if ambiguous:
        issues.append(
            f"Repeated source quotes cannot be located unambiguously for: {', '.join(ambiguous)}."
        )
    for link in links:
        # A broad citation can cover all source characters while one extracted item
        # describes only one of several rules. We cannot determine that from wording
        # alone, so flag the span for review without calling any part "unlinked".
        units = _potential_rule_units(link.text)
        if units < 2:
            continue
        last_line = source.count("\n", 0, link.end - 1) + 1
        location = (
            f"line {link.line}" if last_line == link.line else f"lines {link.line}-{last_line}"
        )
        issues.append(
            f"Quote linked to {', '.join(link.requirement_ids)} spans {units} potential "
            f"rule units at {location}. Review each unit against the extracted requirements; "
            "a text-covered span does not establish that every rule was extracted."
        )
    limit_reached = returned_requirements >= extraction_limit
    if limit_reached:
        issues.append(
            f"Analysis reached the {extraction_limit}-requirement limit "
            f"({returned_requirements} returned, {len(requirements)} retained). "
            "Additional requirements may have been omitted."
        )
    issues.append(
        "Specification completeness is not established. Quote links show textual provenance, "
        "not whether every rule was extracted or interpreted correctly. "
        "Validated requirement links apply only to extracted testable requirements."
    )
    if document:
        issues.extend(document.warnings)
        for fragment in [*links, *fragments]:
            fragment.locations = [
                DocumentLocation(
                    filename=segment.filename,
                    kind=segment.kind,
                    number=segment.number,
                    method=segment.method,
                    confidence=segment.confidence,
                )
                for segment in document.segments
                if segment.start < fragment.end and segment.end > fragment.start
            ]
    return SourceAnalysisAudit(
        extraction_limit=extraction_limit,
        limit_reached=limit_reached,
        returned_requirements=returned_requirements,
        retained_requirements=len(requirements),
        links=links,
        unlinked_fragments=fragments,
        ambiguous_requirement_ids=ambiguous,
        issues=issues,
    )


def _potential_rule_units(quote: str) -> int:
    """Count only visible review cues, not semantic rules or coverage credit."""
    lines = [line.strip() for line in quote.splitlines() if any(c.isalnum() for c in line)]
    if len(lines) > 1:
        return len(lines)
    if not lines:
        return 0
    return len(
        [
            part
            for part in re.split(r"(?<=[.!?。！？;；])\s+(?=\S)", lines[0])
            if any(character.isalnum() for character in part)
        ]
    )

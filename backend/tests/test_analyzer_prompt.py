"""Check that production analysis passes its exception-oracle policy to the model."""

from datetime import UTC, datetime

from app.schemas import Project, RequirementAnalysis, RequirementItem
from app.services.analyzer import analyze_requirements


class RecordingLLM:
    def __init__(self, response: RequirementAnalysis):
        self.response = response
        self.system = None
        self.prompt = None

    def parse(self, *, system, prompt, output_format):
        assert output_format is RequirementAnalysis
        self.system = system
        self.prompt = prompt
        return self.response


def test_unspecified_exception_type_is_explicitly_classified_as_untestable():
    specification = "Negative amounts must raise an exception; its type is unspecified."
    project = Project(
        id="p-exception",
        name="Exception contract",
        requirements_text=specification,
        goal="Check negative amounts.",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    response = RequirementAnalysis(
        requirements=[
            RequirementItem(
                id="R1",
                text="Negative amounts must raise an exception.",
                source_quote=specification,
                testable=False,
                ambiguity="The exception type is unspecified.",
            )
        ],
        notes="",
    )
    llm = RecordingLLM(response)

    result = analyze_requirements(llm, project, max_requirements=40)

    assert "without naming its type" in llm.system
    assert "set `testable` to false" in llm.system
    assert "missing exception type in `ambiguity`" in llm.system
    assert specification in llm.prompt
    assert result.requirements[0].testable is False
    assert result.requirements[0].ambiguity == "The exception type is unspecified."

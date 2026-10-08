"""Provider selection and structured-response failure handling stay offline."""

from types import SimpleNamespace

import httpx
import openai
import pytest
from pydantic import BaseModel

from app.core.config import Settings
from app.services.llm import LLMError, OpenAILLM, create_llm


class Answer(BaseModel):
    value: int


class FakeResponses:
    def __init__(self, response):
        self.response = response
        self.request = None

    def parse(self, **kwargs):
        self.request = kwargs
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def client_with(response):
    responses = FakeResponses(response)
    return SimpleNamespace(responses=responses), responses


def configured_settings(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-only")
    return Settings(_env_file=None)


def test_openai_client_passes_contract_and_returns_parsed_output(monkeypatch):
    settings = configured_settings(monkeypatch)
    answer = Answer(value=7)
    client, responses = client_with(
        SimpleNamespace(status="completed", output=[], output_parsed=answer)
    )

    result = OpenAILLM(settings, client=client).parse(
        system="Read the requirement.", prompt="Return JSON.", output_format=Answer
    )

    assert result is answer
    assert responses.request == {
        "model": "gpt-6.1-sol",
        "instructions": "Read the requirement.",
        "input": "Return JSON.",
        "text_format": Answer,
        "max_output_tokens": 16000,
        "store": False,
    }
    assert isinstance(create_llm(settings), OpenAILLM)


@pytest.mark.parametrize(
    "response",
    [
        SimpleNamespace(
            status="incomplete",
            incomplete_details=SimpleNamespace(reason="max_output_tokens"),
        ),
        SimpleNamespace(
            status="completed",
            output=[SimpleNamespace(content=[SimpleNamespace(type="refusal")])],
        ),
        SimpleNamespace(status="completed", output=[], output_parsed=None),
    ],
)
def test_openai_client_fails_closed_without_complete_structured_answer(monkeypatch, response):
    settings = configured_settings(monkeypatch)
    client, _ = client_with(response)

    with pytest.raises(LLMError):
        OpenAILLM(settings, client=client).parse(
            system="Read the requirement.", prompt="Return JSON.", output_format=Answer
        )


def test_openai_client_disables_implicit_sdk_retries(monkeypatch):
    settings = configured_settings(monkeypatch)
    created = {}

    def fake_openai(**kwargs):
        created.update(kwargs)
        return SimpleNamespace(responses=FakeResponses(None))

    monkeypatch.setattr(openai, "OpenAI", fake_openai)
    OpenAILLM(settings)

    assert created["max_retries"] == 0
    assert created["timeout"] == settings.llm_timeout_seconds


def test_openai_rate_limit_reports_retry_after_without_exposing_credentials(monkeypatch):
    settings = configured_settings(monkeypatch)
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx.Response(429, request=request, headers={"retry-after": "1728"})
    error = openai.RateLimitError("rate limit", response=response, body=None)
    client, _ = client_with(error)

    with pytest.raises(LLMError, match="Retry after 1728 seconds"):
        OpenAILLM(settings, client=client).parse(
            system="Read the requirement.", prompt="Return JSON.", output_format=Answer
        )

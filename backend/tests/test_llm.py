"""Provider selection and real SDK structured responses stay offline."""

import json
from types import SimpleNamespace

import httpx
import openai
import pytest
from pydantic import BaseModel
from test_agent import ANALYSIS, PLAN, SUITE

from app.core.config import Settings
from app.schemas import OracleReview
from app.services.llm import AnthropicLLM, LLMError, OpenAILLM, create_llm


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
    assert settings.llm_model == "gpt-5.6-luna"
    assert responses.request == {
        "model": settings.llm_model,
        "instructions": "Read the requirement.",
        "input": [{"role": "user", "content": "Return JSON."}],
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


def response_body(content, status="completed", reason=None):
    return {
        "id": "resp_test",
        "object": "response",
        "created_at": 1,
        "model": "gpt-6-luna",
        "status": status,
        "incomplete_details": {"reason": reason} if reason else None,
        "output": [
            {
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": content,
            }
        ],
        "parallel_tool_calls": False,
        "tool_choice": "auto",
        "tools": [],
    }


def adapter(handler):
    client = openai.OpenAI(
        api_key="sk-test-only",
        max_retries=0,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    return OpenAILLM(
        Settings(_env_file=None, OPENAI_API_KEY="sk-test-only", llm_model="gpt-6-luna"),
        client=client,
    )


@pytest.mark.parametrize("output", [ANALYSIS, PLAN, SUITE, OracleReview(decisions=[])])
def test_real_sdk_parses_agent_contracts_and_sends_strict_schema(output, monkeypatch):
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)

    def handle(request):
        assert request.url == "https://api.openai.com/v1/responses"
        assert request.headers["Authorization"] == "Bearer sk-test-only"
        body = json.loads(request.content)
        assert body["model"] == "gpt-6-luna"
        assert body["instructions"] == "System instructions"
        assert body["input"] == [{"role": "user", "content": "Requirement text"}]
        assert body["max_output_tokens"] == 16000
        assert body["store"] is False
        schema = body["text"]["format"]
        assert schema["type"] == "json_schema"
        assert schema["strict"] is True
        assert schema["schema"]["additionalProperties"] is False
        return httpx.Response(
            200,
            json=response_body(
                [
                    {
                        "type": "output_text",
                        "text": output.model_dump_json(),
                        "annotations": [],
                    }
                ]
            ),
        )

    llm = adapter(handle)
    assert (
        llm.parse(
            system="System instructions", prompt="Requirement text", output_format=type(output)
        )
        == output
    )


@pytest.mark.parametrize(
    "status, message",
    [
        (401, "key was rejected"),
        (403, "cannot access this model"),
        (429, "quota"),
        (400, "returned 400"),
        (500, "returned 500"),
    ],
)
def test_api_errors_do_not_expose_provider_error_content(status, message):
    llm = adapter(
        lambda request: httpx.Response(
            status,
            json={
                "error": {"message": "SECRET_REQUIREMENT_AND_KEY", "type": "invalid_request_error"},
            },
        )
    )
    with pytest.raises(LLMError, match=message) as caught:
        llm.parse(system="system", prompt="prompt", output_format=OracleReview)
    assert "SECRET_REQUIREMENT_AND_KEY" not in str(caught.value)


@pytest.mark.parametrize(
    "kind, message",
    [
        ("refusal", "declined"),
        ("incomplete", "token limit"),
        ("failed", "did not complete"),
        ("invalid", "invalid structured"),
        ("malformed", "invalid structured"),
        ("empty", "no parsable"),
    ],
)
def test_unusable_responses_are_rejected(kind, message):
    content = [{"type": "output_text", "text": '{"decisions":[]}', "annotations": []}]
    if kind == "refusal":
        content = [{"type": "refusal", "refusal": "Sensitive refusal detail"}]
    elif kind == "invalid":
        content[0]["text"] = '{"decisions":"invalid"}'
    elif kind == "malformed":
        content[0]["text"] = '{"decisions":'
    elif kind == "empty":
        content = []
    body = response_body(
        content,
        status=kind if kind in {"incomplete", "failed"} else "completed",
        reason="max_output_tokens" if kind == "incomplete" else None,
    )
    llm = adapter(lambda request: httpx.Response(200, json=body))
    with pytest.raises(LLMError, match=message):
        llm.parse(system="system", prompt="prompt", output_format=OracleReview)


@pytest.mark.parametrize(
    "error, message",
    [
        (httpx.ConnectError, "could not be reached"),
        (httpx.ReadTimeout, "timed out"),
    ],
)
def test_network_errors_are_reported_safely(error, message):
    def handle(request):
        raise error("Secret provider details", request=request)

    with pytest.raises(LLMError, match=message):
        adapter(handle).parse(system="system", prompt="prompt", output_format=OracleReview)


def test_missing_or_disabled_credentials_stay_disconnected(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "old-provider-key")
    assert create_llm(Settings(_env_file=None)) is None
    assert create_llm(Settings(_env_file=None, OPENAI_API_KEY="")) is None
    assert create_llm(Settings(_env_file=None, OPENAI_API_KEY="sk-test", llm_enabled=False)) is None


def test_dotenv_key_is_used_without_sdk_environment_fallback(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=sk-local-test\nREQTEST_LLM_MODEL=gpt-6-luna\n")
    llm = create_llm(Settings(_env_file=env))
    assert isinstance(llm, OpenAILLM)
    assert llm._client.api_key == "sk-local-test"
    assert llm._client.max_retries == 0


def test_injected_openai_client_does_not_require_credentials(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    answer = Answer(value=7)
    client, _ = client_with(
        SimpleNamespace(status="completed", output=[], output_parsed=answer)
    )
    llm = OpenAILLM(Settings(_env_file=None), client=client)
    assert llm.parse(system="system", prompt="prompt", output_format=Answer) is answer


def test_openai_sdk_preserves_configured_base_url(monkeypatch):
    monkeypatch.setenv("OPENAI_BASE_URL", "http://localhost:9999/v1")
    llm = create_llm(Settings(_env_file=None, OPENAI_API_KEY="sk-test-only"))
    assert isinstance(llm, OpenAILLM)
    assert str(llm._client.base_url) == "http://localhost:9999/v1/"


def test_anthropic_provider_preserves_its_messages_api(monkeypatch):
    import anthropic

    answer = Answer(value=7)
    messages = FakeResponses(SimpleNamespace(stop_reason="end_turn", parsed_output=answer))
    client = SimpleNamespace(messages=messages, auth_headers={"x-api-key": "sk-test-only"})
    monkeypatch.setattr(anthropic, "Anthropic", lambda **kwargs: client)
    llm = create_llm(
        Settings(
            _env_file=None,
            llm_provider="anthropic",
            llm_model="claude-opus-5",
            ANTHROPIC_API_KEY="sk-test-only",
        )
    )
    assert isinstance(llm, AnthropicLLM)
    assert llm.parse(system="system", prompt="prompt", output_format=Answer) is answer
    assert messages.request["model"] == "claude-opus-5"
    assert messages.request["output_format"] is Answer
    assert messages.request["messages"] == [{"role": "user", "content": "prompt"}]

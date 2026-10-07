"""Exercise the real OpenAI SDK through an in-memory HTTP transport."""

import json

import httpx
import pytest
from openai import OpenAI
from test_agent import ANALYSIS, PLAN, SUITE

from app.core.config import Settings
from app.schemas import OracleReview
from app.services.llm import LLMError, OpenAILLM, create_llm


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
    client = OpenAI(
        api_key="sk-test-only",
        max_retries=0,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    return OpenAILLM(Settings(_env_file=None, OPENAI_API_KEY="sk-test-only"), client=client)


@pytest.mark.parametrize("output", [ANALYSIS, PLAN, SUITE, OracleReview(decisions=[])])
def test_real_sdk_parses_agent_contracts_and_sends_strict_schema(output):
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
        ("empty", "no parsable"),
    ],
)
def test_unusable_responses_are_rejected(kind, message):
    content = [{"type": "output_text", "text": '{"decisions":[]}', "annotations": []}]
    if kind == "refusal":
        content = [{"type": "refusal", "refusal": "Sensitive refusal detail"}]
    elif kind == "invalid":
        content[0]["text"] = '{"decisions":"invalid"}'
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

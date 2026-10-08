"""Structured model clients used by every agent stage."""

import logging
from typing import Protocol, TypeVar

from pydantic import BaseModel

from app.core.config import Settings

logger = logging.getLogger(__name__)

Output = TypeVar("Output", bound=BaseModel)


class LLMError(RuntimeError):
    """The model could not be reached, declined the request, or returned no parsed output."""


class MissingCredentials(LLMError):
    """No credentials for the configured provider were found."""


class StructuredLLM(Protocol):
    """Shared contract for production clients and test fakes."""

    def parse(self, *, system: str, prompt: str, output_format: type[Output]) -> Output: ...


class OpenAILLM:
    def __init__(self, settings: Settings, client=None):
        import openai

        key = settings.openai_api_key
        if key is None:
            raise MissingCredentials("OPENAI_API_KEY is not configured.")
        self._openai = openai
        self._client = client or openai.OpenAI(
            api_key=key.get_secret_value(),
            timeout=settings.llm_timeout_seconds,
            max_retries=0,
        )
        self._model = settings.llm_model
        self._max_tokens = settings.llm_max_tokens

    def parse(self, *, system: str, prompt: str, output_format: type[Output]) -> Output:
        openai = self._openai
        try:
            response = self._client.responses.parse(
                model=self._model,
                instructions=system,
                input=prompt,
                text_format=output_format,
                max_output_tokens=self._max_tokens,
                store=False,
            )
        except openai.AuthenticationError as error:
            raise LLMError("The configured OpenAI API key was rejected.") from error
        except openai.PermissionDeniedError as error:
            raise LLMError("The configured OpenAI account cannot access this model.") from error
        except openai.RateLimitError as error:
            retry_after = error.response.headers.get("retry-after", "")
            if retry_after.isdecimal():
                raise LLMError(
                    f"The OpenAI API is rate limited. Retry after {retry_after} seconds."
                ) from error
            raise LLMError("The OpenAI API is rate limited. Retry this run later.") from error
        except openai.APIStatusError as error:
            raise LLMError(f"The OpenAI API returned {error.status_code}.") from error
        except openai.APIConnectionError as error:
            raise LLMError("The OpenAI API could not be reached.") from error
        except openai.OpenAIError as error:
            raise LLMError("The OpenAI API request failed.") from error

        if response.status == "incomplete":
            reason = getattr(response.incomplete_details, "reason", None)
            if reason == "max_output_tokens":
                raise LLMError(
                    "The model response hit the token limit before the output was complete. "
                    "Reduce the requirement text or raise REQTEST_LLM_MAX_TOKENS."
                )
            raise LLMError(f"The model response was incomplete ({reason or 'unknown reason'}).")
        if response.status != "completed":
            raise LLMError(f"The model response did not complete ({response.status}).")
        for item in response.output or []:
            for content in getattr(item, "content", []) or []:
                if getattr(content, "type", None) == "refusal":
                    raise LLMError("The model declined this request.")
        parsed = response.output_parsed
        if not isinstance(parsed, output_format):
            raise LLMError("The model returned no parsable structured output.")
        return parsed


class AnthropicLLM:
    def __init__(self, settings: Settings, client=None):
        import anthropic

        self._anthropic = anthropic
        key = settings.anthropic_api_key
        self._client = client or anthropic.Anthropic(
            timeout=settings.llm_timeout_seconds,
            **({"api_key": key.get_secret_value()} if key else {}),
        )
        if not self.has_credentials(self._client):
            raise MissingCredentials(
                "No Anthropic API key or stored credential profile could be resolved."
            )
        self._model = settings.llm_model
        self._max_tokens = settings.llm_max_tokens

    @staticmethod
    def has_credentials(client) -> bool:
        """The SDK resolves a key, a token, or a stored profile; any sets a header."""
        return bool(getattr(client, "auth_headers", None)) or (
            getattr(client, "credentials", None) is not None
        )

    def parse(self, *, system: str, prompt: str, output_format: type[Output]) -> Output:
        anthropic = self._anthropic
        try:
            response = self._client.messages.parse(
                model=self._model,
                max_tokens=self._max_tokens,
                thinking={"type": "adaptive"},
                system=system,
                messages=[{"role": "user", "content": prompt}],
                output_format=output_format,
            )
        except anthropic.AuthenticationError as error:
            raise LLMError("The configured API credentials were rejected.") from error
        except anthropic.RateLimitError as error:
            raise LLMError("The model API is rate limited. Retry this run later.") from error
        except anthropic.APIStatusError as error:
            raise LLMError(f"The model API returned {error.status_code}.") from error
        except anthropic.APIConnectionError as error:
            raise LLMError("The model API could not be reached.") from error

        if response.stop_reason == "refusal":
            category = getattr(response.stop_details, "category", None)
            raise LLMError(f"The model declined this request (category: {category}).")
        if response.stop_reason == "max_tokens":
            raise LLMError(
                "The model response hit the token limit before the output was complete. "
                "Reduce the requirement text or raise REQTEST_LLM_MAX_TOKENS."
            )
        parsed = response.parsed_output
        if parsed is None:
            raise LLMError("The model returned no parsable structured output.")
        return parsed


def create_llm(settings: Settings) -> StructuredLLM | None:
    """Return the configured provider client, or None without its SDK/credentials."""
    if not settings.llm_enabled:
        return None
    try:
        if settings.llm_provider == "openai":
            return OpenAILLM(settings)
        return AnthropicLLM(settings)
    except ImportError:
        logger.warning(
            "The %s package is not installed; agent stages stay disconnected.",
            settings.llm_provider,
        )
    except MissingCredentials as error:
        logger.warning("%s Agent stages stay disconnected.", error)
    return None

"""Thin wrapper around the Anthropic Messages API.

Only structured output is used: every agent stage declares a Pydantic contract and
receives a validated instance, so no stage has to parse free-form model prose.
"""

import logging
from typing import Protocol, TypeVar

from pydantic import BaseModel

from app.core.config import Settings

logger = logging.getLogger(__name__)

Output = TypeVar("Output", bound=BaseModel)


class LLMError(RuntimeError):
    """The model could not be reached, declined the request, or returned no parsed output."""


class MissingCredentials(LLMError):
    """No API key, auth token, or stored credential profile was found."""


class StructuredLLM(Protocol):
    """Implemented by AnthropicLLM in production and by fakes in the test suite."""

    def parse(self, *, system: str, prompt: str, output_format: type[Output]) -> Output: ...


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
            raise MissingCredentials("No API key or stored credential profile could be resolved.")
        self._model = settings.llm_model
        self._max_tokens = settings.llm_max_tokens

    @staticmethod
    def has_credentials(client) -> bool:
        """The SDK resolves a key, a token, or a stored profile; any of them sets a header."""
        return bool(client.auth_headers) or client.credentials is not None

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


def create_llm(settings: Settings) -> AnthropicLLM | None:
    """Return a client, or None when the SDK or credentials are missing.

    Credentials resolve from ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or a stored
    `ant auth login` profile, so this constructs a client rather than reading one
    environment variable.
    """
    if not settings.llm_enabled:
        return None
    try:
        return AnthropicLLM(settings)
    except ImportError:
        logger.warning("The anthropic package is not installed; agent stages stay disconnected.")
    except MissingCredentials as error:
        logger.warning("%s Agent stages stay disconnected.", error)
    return None

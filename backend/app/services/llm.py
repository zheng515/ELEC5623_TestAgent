"""OpenAI Responses API adapter with validated structured output for each stage."""

import logging
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.config import Settings

logger = logging.getLogger(__name__)
Output = TypeVar("Output", bound=BaseModel)


class LLMError(RuntimeError):
    """The model could not be reached or returned unusable structured output."""


class MissingCredentials(LLMError):
    """No OpenAI API key was configured."""


class StructuredLLM(Protocol):
    """Implemented by OpenAILLM in production and by fakes in the test suite."""

    def parse(self, *, system: str, prompt: str, output_format: type[Output]) -> Output: ...


class OpenAILLM:
    def __init__(self, settings: Settings, client=None):
        import openai

        self._openai = openai
        key = settings.openai_api_key
        if client is None and key is None:
            raise MissingCredentials("OPENAI_API_KEY is not configured.")
        self._client = (
            client
            if client is not None
            else openai.OpenAI(
                api_key=key.get_secret_value(),
                base_url="https://api.openai.com/v1",
                timeout=settings.llm_timeout_seconds,
                max_retries=0,
            )
        )
        self._model = settings.llm_model
        self._max_tokens = settings.llm_max_tokens

    def parse(self, *, system: str, prompt: str, output_format: type[Output]) -> Output:
        openai = self._openai
        try:
            response = self._client.responses.parse(
                model=self._model,
                instructions=system,
                input=[{"role": "user", "content": prompt}],
                text_format=output_format,
                max_output_tokens=self._max_tokens,
                store=False,
            )
        except openai.AuthenticationError as error:
            raise LLMError("The configured OpenAI API key was rejected.") from error
        except openai.RateLimitError as error:
            raise LLMError("The model API is rate limited or has no available quota.") from error
        except openai.APITimeoutError as error:
            raise LLMError("The model API request timed out.") from error
        except openai.APIConnectionError as error:
            raise LLMError("The model API could not be reached.") from error
        except openai.APIStatusError as error:
            raise LLMError(f"The model API returned {error.status_code}.") from error
        except (ValidationError, ValueError, openai.APIResponseValidationError) as error:
            raise LLMError("The model returned invalid structured output.") from error

        if response.status == "incomplete":
            if getattr(response.incomplete_details, "reason", None) == "max_output_tokens":
                raise LLMError(
                    "The model response hit the token limit before the output was complete. "
                    "Reduce the requirement text or raise REQTEST_LLM_MAX_TOKENS."
                )
            raise LLMError("The model response was incomplete.")
        if response.status != "completed":
            raise LLMError("The model response did not complete successfully.")
        for item in response.output:
            if item.type == "message" and any(part.type == "refusal" for part in item.content):
                raise LLMError("The model declined this request.")
        parsed = response.output_parsed
        if not isinstance(parsed, output_format):
            raise LLMError("The model returned no parsable structured output.")
        return parsed


def create_llm(settings: Settings) -> OpenAILLM | None:
    """Use OPENAI_API_KEY from Settings, or stay disconnected when it is absent."""
    if not settings.llm_enabled:
        return None
    try:
        return OpenAILLM(settings)
    except ImportError:
        logger.warning("The openai package is not installed; agent stages stay disconnected.")
    except MissingCredentials as error:
        logger.warning("%s Agent stages stay disconnected.", error)
    return None

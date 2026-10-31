"""Swappable LLM backends. Everything else depends only on `LLMProvider`."""

import os
from typing import Protocol

import anthropic


class ProviderNotConfiguredError(RuntimeError):
    pass


class LLMProvider(Protocol):
    def complete(self, system: str, user: str, max_tokens: int = 2000) -> str: ...


class AnthropicProvider:
    def __init__(self, api_key: str, model: str) -> None:
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model

    def complete(self, system: str, user: str, max_tokens: int = 2000) -> str:
        message = self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(b.text for b in message.content if b.type == "text")


def provider_from_env() -> LLMProvider:
    key = os.environ.get("AMCN_ANTHROPIC_API_KEY")
    if not key:
        raise ProviderNotConfiguredError(
            "No model provider configured. Set AMCN_ANTHROPIC_API_KEY."
        )
    return AnthropicProvider(key, os.environ.get("AMCN_MODEL", "claude-sonnet-5-5"))

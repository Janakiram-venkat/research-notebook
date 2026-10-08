"""The agent loop: stream a Claude turn, run any tool calls, feed results back, repeat.

Yields plain dict events the HTTP layer forwards as server-sent events:

  text / thinking   incremental model output
  tool_use          the model called a tool
  tool_result       what the tool returned (`changed` lists note ids it wrote)
  done              finished (with stop_reason and token usage)
  error             something stopped the run

The loop is written by hand rather than with the SDK's tool runner so each step can
be streamed to the browser as it happens.
"""

from typing import Any, AsyncIterator, Callable

import anthropic

from ..config import get_settings
from .profiles import AgentProfile
from .tools import TOOL_DEFS, run_tool

Event = dict[str, Any]
ClientFactory = Callable[[], Any]


def default_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic()


async def run_agent(
    profile: AgentProfile,
    messages: list[dict[str, Any]],
    *,
    client_factory: ClientFactory = default_client,
    user_id: str = "",
) -> AsyncIterator[Event]:
    settings = get_settings()
    convo = list(messages)
    usage = {"input_tokens": 0, "output_tokens": 0}
    try:
        client = client_factory()
        for _ in range(settings.agent_max_steps):
            async with client.messages.stream(
                model=settings.agent_model,
                max_tokens=settings.agent_max_tokens,
                system=profile.system,
                tools=TOOL_DEFS,
                messages=convo,
                thinking={"type": "adaptive", "display": "summarized"},
                cache_control={"type": "ephemeral"},
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_delta":
                        if event.delta.type == "text_delta":
                            yield {"type": "text", "text": event.delta.text}
                        elif event.delta.type == "thinking_delta":
                            yield {"type": "thinking", "text": event.delta.thinking}
                final = await stream.get_final_message()

            usage["input_tokens"] += final.usage.input_tokens
            usage["output_tokens"] += final.usage.output_tokens

            if final.stop_reason == "refusal":
                details = getattr(final, "stop_details", None)
                category = getattr(details, "category", None)
                yield {"type": "error", "message": "The model declined this request." + (f" ({category})" if category else "")}
                return
            if final.stop_reason == "max_tokens":
                yield {"type": "error", "message": "The reply was cut off at the length limit."}
                return

            tool_calls = [b for b in final.content if b.type == "tool_use"]
            if final.stop_reason != "tool_use" or not tool_calls:
                yield {"type": "done", "stop_reason": final.stop_reason, "usage": usage}
                return

            # Echo the assistant turn back unchanged (thinking blocks included), then answer
            # every tool call in ONE user message.
            convo.append({"role": "assistant", "content": final.content})
            results = []
            for call in tool_calls:
                yield {"type": "tool_use", "id": call.id, "name": call.name, "input": call.input}
                content, is_error, result = run_tool(call.name, call.input, user_id)
                yield {
                    "type": "tool_result",
                    "id": call.id,
                    "name": call.name,
                    "ok": not is_error,
                    "summary": content if is_error else result.summary,  # type: ignore[union-attr]
                    "changed": [] if is_error else result.changed,  # type: ignore[union-attr]
                }
                results.append({
                    "type": "tool_result",
                    "tool_use_id": call.id,
                    "content": content,
                    **({"is_error": True} if is_error else {}),
                })
            convo.append({"role": "user", "content": results})

        yield {"type": "error", "message": f"Stopped after {settings.agent_max_steps} steps without finishing."}
    except anthropic.AuthenticationError:
        yield {"type": "error", "message": "No valid Anthropic credentials. Set ANTHROPIC_API_KEY for the backend."}
    except anthropic.RateLimitError:
        yield {"type": "error", "message": "Rate limited by the Anthropic API. Try again in a moment."}
    except anthropic.APIConnectionError:
        yield {"type": "error", "message": "Could not reach the Anthropic API."}
    except anthropic.APIStatusError as err:
        yield {"type": "error", "message": f"Anthropic API error {err.status_code}: {err.message}"}
    except Exception as err:  # keep the stream well-formed whatever happens
        if "Could not resolve authentication" in str(err):
            # The SDK raises this at request time when no key/profile is configured.
            yield {"type": "error", "message": "No Anthropic credentials. Set ANTHROPIC_API_KEY in backend/.env and restart the backend."}
            return
        yield {"type": "error", "message": f"Agent failed: {err}"}

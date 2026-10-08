"""Agent loop tests against a scripted fake of the Anthropic streaming client."""

import asyncio
import json
from types import SimpleNamespace as NS

from app.agent import runner
from app.agent.profiles import PROFILES
from app.agent.tools import run_tool
from conftest import note


class FakeStream:
    def __init__(self, final, deltas):
        self.final, self.deltas = final, deltas

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def __aiter__(self):
        async def gen():
            for text in self.deltas:
                yield NS(type="content_block_delta", delta=NS(type="text_delta", text=text))
        return gen()

    async def get_final_message(self):
        return self.final


def message(content, stop_reason, deltas=()):
    return FakeStream(NS(content=content, stop_reason=stop_reason,
                         usage=NS(input_tokens=10, output_tokens=5)), list(deltas))


class FakeClient:
    """Plays back one scripted stream per call and records the requests."""

    def __init__(self, *streams):
        self.streams, self.requests = list(streams), []
        self.messages = self

    def stream(self, **kwargs):
        self.requests.append(kwargs)
        return self.streams.pop(0)


def collect(profile, messages, client):
    async def go():
        return [e async for e in runner.run_agent(profile, messages, client_factory=lambda: client)]
    return asyncio.run(go())


def seed(client, **kw):
    assert client.put(f"/api/notes/{kw['id']}", json=note(**kw)).status_code == 200


def test_tool_loop_runs_tools_and_streams_the_answer(client):
    seed(client, id="a", title="Bayes rule")
    call = NS(type="tool_use", id="t1", name="search_notes", input={"query": "bayes"})
    fake = FakeClient(
        message([call], "tool_use"),
        message([NS(type="text", text="Found it.")], "end_turn", deltas=["Found ", "it."]),
    )
    events = collect(PROFILES["research"], [{"role": "user", "content": "what do I know?"}], fake)

    assert [e["type"] for e in events] == ["tool_use", "tool_result", "text", "text", "done"]
    assert events[1]["ok"] and "1 matches" in events[1]["summary"]
    assert events[-1]["usage"] == {"input_tokens": 20, "output_tokens": 10}

    # The second request carries the assistant turn and ONE user message with the tool result.
    second = fake.requests[1]["messages"]
    assert second[-2]["role"] == "assistant" and second[-1]["role"] == "user"
    result = second[-1]["content"][0]
    assert result["type"] == "tool_result" and result["tool_use_id"] == "t1"
    assert "Bayes rule" in result["content"]


def test_agent_writes_report_changed_ids_and_land_in_the_store(client):
    call = NS(type="tool_use", id="t1", name="create_note",
              input={"title": "Quiz", "markdown": "Q1", "tags": ["study"]})
    fake = FakeClient(message([call], "tool_use"), message([NS(type="text", text="ok")], "end_turn"))
    events = collect(PROFILES["study"], [{"role": "user", "content": "make a quiz"}], fake)

    changed = events[1]["changed"]
    assert len(changed) == 1
    saved = client.get(f"/api/notes/{changed[0]}").json()
    assert saved["title"] == "Quiz" and saved["tags"] == ["study"]


def test_a_failing_tool_is_reported_to_the_model_not_raised(client):
    call = NS(type="tool_use", id="t1", name="read_note", input={"note_id": "missing"})
    fake = FakeClient(message([call], "tool_use"), message([NS(type="text", text="sorry")], "end_turn"))
    events = collect(PROFILES["assistant"], [{"role": "user", "content": "x"}], fake)

    assert events[1]["ok"] is False
    sent = fake.requests[1]["messages"][-1]["content"][0]
    assert sent["is_error"] is True and "No note with id" in sent["content"]
    assert events[-1]["type"] == "done"


def test_step_limit_stops_a_looping_agent(client, monkeypatch):
    monkeypatch.setenv("NB_AGENT_MAX_STEPS", "2")
    call = NS(type="tool_use", id="t", name="list_notes", input={})
    fake = FakeClient(*[message([call], "tool_use") for _ in range(2)])
    events = collect(PROFILES["assistant"], [{"role": "user", "content": "x"}], fake)
    assert events[-1]["type"] == "error" and "2 steps" in events[-1]["message"]


def test_refusal_and_truncation_become_errors(client):
    for reason, text in (("refusal", "declined"), ("max_tokens", "cut off")):
        fake = FakeClient(message([], reason))
        events = collect(PROFILES["assistant"], [{"role": "user", "content": "x"}], fake)
        assert events[-1]["type"] == "error" and text in events[-1]["message"]


def test_missing_credentials_is_a_readable_error(client):
    import anthropic, httpx

    def boom():
        raise anthropic.AuthenticationError(
            "bad", response=httpx.Response(401, request=httpx.Request("POST", "http://x")), body=None)

    events = [e for e in asyncio.run(_drain(runner.run_agent(PROFILES["assistant"], [], client_factory=boom)))]
    assert "ANTHROPIC_API_KEY" in events[0]["message"]


async def _drain(gen):
    return [e async for e in gen]


def test_tools_never_overwrite_or_delete(client):
    seed(client, id="a", title="Keep me")
    run_tool("append_to_note", {"note_id": "a", "markdown": "added"})
    blocks = client.get("/api/notes/a").json()["content"]
    assert [b["markdown"] for b in blocks] == ["hello", "added"]
    assert run_tool("delete_note", {"note_id": "a"})[1] is True  # no such tool


def test_find_related_follows_links_and_tags(client):
    link = [{"id": "x", "type": "text", "markdown": "see [[Beta]] and [[c|Gamma]]"}]
    seed(client, id="a", title="Alpha", tags=["t"], content=link)
    seed(client, id="b", title="Beta", tags=["t"])
    seed(client, id="c", title="Gamma")
    data = json.loads(run_tool("find_related", {"note_id": "b"})[0])
    assert [n["id"] for n in data["linked_from"]] == ["a"]
    assert [n["id"] for n in data["shares_tags"]] == ["a"]
    out = json.loads(run_tool("find_related", {"note_id": "a"})[0])
    assert sorted(n["id"] for n in out["links_to"]) == ["b", "c"]


def test_chat_endpoint_streams_sse_and_adds_focus_context(client, monkeypatch):
    seed(client, id="a", title="Focus me")
    fake = FakeClient(message([NS(type="text", text="hi")], "end_turn", deltas=["hi"]))
    monkeypatch.setattr(runner, "default_client", lambda: fake)

    r = client.post("/api/agents/study/chat", json={
        "messages": [{"role": "user", "content": "quiz me"}], "focus_note_id": "a"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = [json.loads(l[6:]) for l in r.text.splitlines() if l.startswith("data: ")]
    assert [e["type"] for e in events] == ["text", "done"]
    assert "Focus me" in fake.requests[0]["messages"][0]["content"]


def test_chat_validation(client):
    assert client.post("/api/agents/nope/chat", json={"messages": [{"role": "user", "content": "x"}]}).status_code == 404
    assert client.post("/api/agents/study/chat", json={"messages": [{"role": "assistant", "content": "x"}]}).status_code == 400
    assert client.post("/api/agents/study/chat", json={"messages": []}).status_code == 422
    names = [a["key"] for a in client.get("/api/agents").json()]
    assert names == ["assistant", "research", "study", "decision"]

from webwright.models.zhipu_model import ZhipuModel


def test_zhipu_action_payload_uses_native_json_mode() -> None:
    model = ZhipuModel(zhipu_api_key="test-key", model_name="glm-5.2")

    payload = model._build_payload(
        [
            {"role": "system", "content": "Return JSON.", "extra": {}},
            {"role": "user", "content": "Inspect the page.", "extra": {}},
        ]
    )

    assert payload["model"] == "glm-5.2"
    assert payload["response_format"] == {"type": "json_object"}
    assert payload["messages"] == [
        {"role": "system", "content": "Return JSON."},
        {"role": "user", "content": "Inspect the page."},
    ]


def test_zhipu_text_payload_does_not_force_json_mode() -> None:
    model = ZhipuModel(zhipu_api_key="test-key")

    payload = model._build_text_payload(
        [{"role": "user", "content": "Describe this screenshot.", "extra": {}}]
    )

    assert "response_format" not in payload


def test_format_repair_preserves_invalid_assistant_turn() -> None:
    model = ZhipuModel(zhipu_api_key="test-key")

    messages = model._format_repair_messages(raw_text="I will click it.", error="Expected JSON")

    assert [message["role"] for message in messages] == ["assistant", "user"]
    assert messages[0]["content"] == "I will click it."
    assert "Return only one valid JSON object" in messages[1]["content"]


def test_zhipu_empty_content_repair_disables_thinking() -> None:
    model = ZhipuModel(zhipu_api_key="test-key")

    payload = model._build_repair_payload([], raw_text="", error="Expected JSON")

    assert payload["thinking"] == {"type": "disabled"}


def test_zhipu_nonempty_format_repair_keeps_default_thinking() -> None:
    model = ZhipuModel(zhipu_api_key="test-key")

    payload = model._build_repair_payload(
        [], raw_text="not valid JSON", error="Expected JSON"
    )

    assert "thinking" not in payload


def test_zhipu_empty_structured_repair_disables_thinking() -> None:
    model = ZhipuModel(zhipu_api_key="test-key")

    payload = model._build_structured_repair_payload(
        [],
        schema={"type": "object"},
        schema_name="developer_slot",
        raw_text="",
        error="Expected Developer Slot JSON",
    )

    assert payload["response_format"] == {"type": "json_object"}
    assert payload["thinking"] == {"type": "disabled"}


def test_zhipu_query_disables_thinking_only_after_empty_content(monkeypatch) -> None:
    model = ZhipuModel(zhipu_api_key="test-key", action_field="python_code")
    payloads = []
    responses = iter(
        [
            {
                "choices": [{"message": {"content": ""}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 20},
            },
            {
                "choices": [
                    {
                        "message": {
                            "content": '{"thought":"ready","python_code":"","done":true,"final_response":"done"}'
                        }
                    }
                ],
                "usage": {"prompt_tokens": 12, "completion_tokens": 10},
            },
        ]
    )

    async def fake_post(payload):
        payloads.append(payload)
        return next(responses)

    monkeypatch.setattr(model, "_post_with_retries", fake_post)

    message = model.query([{"role": "user", "content": "Run.", "extra": {}}])

    assert "thinking" not in payloads[0]
    assert payloads[1]["thinking"] == {"type": "disabled"}
    assert message["extra"]["done"] is True

from __future__ import annotations


class InterruptAgentFlow(Exception):
    def __init__(self, *messages: dict):
        super().__init__()
        self.messages = list(messages)


class LimitsExceeded(InterruptAgentFlow):
    pass


class Submitted(InterruptAgentFlow):
    pass


class FormatError(InterruptAgentFlow):
    pass


class RuntimeExecutionError(RuntimeError):
    def __init__(self, message: str, *, error_code: str, stage: str):
        super().__init__(message)
        self.error_code = error_code
        self.stage = stage

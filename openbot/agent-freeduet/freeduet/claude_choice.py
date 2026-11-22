"""D139. The person's optional choice of Claude model and effort for one member, on the subscription Claude Code engine only.

Verified against Claude Code 2.1.311 (the version the image pins): ``claude --help`` lists ``--model <model>`` (an alias such as
``sonnet`` or ``opus``, or a full model name) and ``--effort <level>`` with the levels ``low, medium, high, xhigh, max``. Only
words of the two closed lists below ever reach the command line: the page's value is checked against them when it is saved, when
the file is loaded, and again here when the argument list is built, so free text can never become an argument. No choice means
no flag, and the CLI then runs the subscription's own default exactly as before."""

from dataclasses import dataclass

#: The aliases offered. Each stands for the latest model of its family, so the list needs no change when a model is released.
MODELS = ("haiku", "sonnet", "opus")
#: The levels ``claude --help`` names for ``--effort`` (2.1.311). A model that does not take a level is the CLI's to answer.
EFFORTS = ("low", "medium", "high", "xhigh", "max")


@dataclass(frozen=True)
class ClaudeChoice:
    """``model`` and ``effort`` are each None (the subscription's default) or one word of the lists above."""

    model: str | None = None
    effort: str | None = None

    def is_default(self) -> bool:
        return self.model is None and self.effort is None


def checked_model(value) -> str | None:
    """The word when it is on the list, else None. Never raises."""
    return value if isinstance(value, str) and value in MODELS else None


def checked_effort(value) -> str | None:
    return value if isinstance(value, str) and value in EFFORTS else None


def args(choice: "ClaudeChoice | None") -> list[str]:
    """``--model`` and ``--effort`` for the words that are on the lists, nothing for anything else."""
    if choice is None:
        return []
    found: list[str] = []
    model, effort = checked_model(choice.model), checked_effort(choice.effort)
    if model:
        found += ["--model", model]
    if effort:
        found += ["--effort", effort]
    return found

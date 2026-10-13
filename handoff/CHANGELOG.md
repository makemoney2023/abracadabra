# Changelog

## 2026-10-13

- **What changed** — A specialist stage can stop with `{"questions":[...]}` instead of a page. The stage status becomes `question`, the task waits on staff, and HQ is told to call `open_questions` then `answer_question`. That answer runs the stage again. A visual stage asks when the model, the ratio, or a brand color is missing. Later stages stay queued while it asks. `answer_question` does not wait for an approval card.

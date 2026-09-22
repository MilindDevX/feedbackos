# FeedbackOS evaluation dataset

`feedbackos-eval-v0.1.csv` is a synthetic, candidate-labeled benchmark for the FeedbackOS classification contract.

## Structure

- 192 unique feedback examples.
- Six categories with 32 examples each.
- `dev`: 48 examples, eight per category. Use for prompt calibration and debugging.
- `test`: 144 locked examples, 24 per category. Do not inspect or tune against these while changing prompts or models.
- Separate category, urgency, sentiment, product-area, difficulty, and human-review labels.

## Review state

Eight examples are marked `approved_anchor`; Milind approved those labels during the live calibration discussion. Ten examples are marked `approved_rule` after explicit boundary review. The remaining 174 rows are marked `rule_applied`: they are internally consistent synthetic labels, not independently reviewed ground truth. Only the explicitly approved rows should be described as human-reviewed ground truth.

Capability boundary:

- An explicit request to add or change behavior is a `feature_request`.
- A question about whether a capability exists is `question_support`.
- Insufficient or genuinely ambiguous intent keeps the best available category and sets `requires_human_review` to `true`.
- Security/privacy-sensitive feedback sets `requires_human_review` to `true`; short wording alone does not.
- Factual product problems and usability friction have negative sentiment even without emotional wording.
- Renewals and other implicit evidence of realized value are `praise`.

The content is synthetic. It is not customer data and cannot support claims about production accuracy.

## Label contract

Categories:

- `bug_problem`
- `feature_request`
- `usability_issue`
- `question_support`
- `praise`
- `other`

Urgency:

- `critical`: security or privacy incident, data loss, outage, or broadly blocked core workflow.
- `high`: major task blocked, severe repeated failure, or no reasonable workaround.
- `medium`: meaningful friction or partial failure with a workaround.
- `low`: minor inconvenience, suggestion, praise, non-urgent question, or noise.

Angry wording alone does not raise urgency; impact does.

## Evaluation policy

1. Tune prompts only with the `dev` split.
2. Freeze the prompt, model, schema, and review threshold before running `test`.
3. Record model/provider, prompt version, dataset version, date, latency, token usage, and invalid-output count.
4. Report category macro-F1, urgency accuracy, sentiment accuracy, full exact match, review rate, and invalid-output rate.
5. Never replace failed classifications with invented labels.

## Running the evaluator

The evaluator defaults to the development split and prints a JSON report:

```bash
GROQ_API_KEY=... pnpm eval:classification
```

Use `--output=path/to/report.json` to save the report. The locked test split refuses to run unless
`--split=test --allow-locked-test` is passed after the prompt, model, schema, and review threshold are frozen.

The current classifier does not emit urgency, so `urgencyAccuracy` is reported as `null` instead of being
fabricated. Invalid API or schema responses are counted in `invalidOutputRate` and remain visible in the report.

## Frozen development result

The prompt and dataset were frozen after the clean `dev-baseline-2026-09-22-v3-repeat.json` run:

- Category macro-F1: 1.0000
- Sentiment accuracy: 0.9792
- Product-area accuracy: 0.8750
- Human-review accuracy: 0.9583
- Full exact match: 0.8333
- Invalid-output rate: 0.0000
- Prompt SHA-256: `669f6eb88884f3097381f2c7f2d0dad009eddf2a684681689beb22c0f839f3a2`
- Dataset SHA-256: `c6a4afba5b3d22111625acb858fc4915d0ff516722ec2f61105aa41a33f33cfb`

Do not change the prompt, schema, dataset, model, or review policy before the locked test evaluation.

## Locked test result

The locked 144-row test split was evaluated once with `openai/gpt-oss-120b` after the hashes above were
verified. No prompt, schema, dataset, or policy changes were made from the frozen development run.

- Category macro-F1: 0.8889
- Sentiment accuracy: 0.9583
- Product-area accuracy: 0.8194
- Human-review accuracy: 0.8750
- Full exact match: 0.6597
- Invalid-output rate: 0.0000
- Average latency: 2,824 ms

Category F1:

- `bug_problem`: 0.766
- `feature_request`: 0.958
- `usability_issue`: 0.824
- `question_support`: 0.902
- `praise`: 1.000
- `other`: 0.884

The largest observed confusion is `bug_problem` versus `usability_issue`. These scores describe this synthetic,
candidate-labeled benchmark only; they are not production-accuracy claims.

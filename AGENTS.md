# Repository Instructions

## Project context

This repository will contain a command-line interface (CLI) for the IntelliGRC API.

The API documentation belongs to IntelliGRC and is not distributed with this repository.
A maintainer keeps a local, gitignored copy of the OpenAPI document at
`official-docs/swagger/v1/swagger.json`. Treat that document as the authoritative source
for documented API paths, parameters, request bodies, and response schemas. See
`official-docs/README.md` for how the local copy is obtained and verified.

Do not invent undocumented API behavior. Record missing information as an open question
or an explicit assumption. Important known gaps include the API base URL, formal security
schemes, pagination behavior, rate limits, and complete error responses.

Never commit credentials, session cookies, client secrets, tenant secrets, or copied
production data.

## Communication standard

Write for two readers:

1. A product owner who understands IntelliGRC but is not required to know software jargon.
2. An engineer or coding agent who must implement the work without access to the planning
   conversation.

Use these rules:

- Lead with the outcome.
- Use common, literal words.
- Use one term for one concept. Do not alternate between synonyms for variety.
- Define an acronym the first time it appears.
- Use active voice and name the actor when ownership matters.
- Put one action or requirement in each sentence.
- Use short sections with descriptive headings.
- Use numbered lists for ordered work and bullets for unordered facts.
- Put instructions next to the context needed to perform them. Do not make the reader
  remember facts from another section.
- Replace vague references such as "it," "this," "handle errors," "wire it up," or
  "as needed" with the exact subject, behavior, or condition.
- Keep necessary technical terms. Define them instead of replacing them with inaccurate
  everyday words.

These rules borrow useful constraints from ASD-STE100, but this repository does not claim
ASD-STE100 conformance. Do not enforce its controlled dictionary. Software plans need
project-specific technical terms.

## Requirements language

Use `MUST`, `MUST NOT`, `SHOULD`, and `MAY` only when a plan needs formal requirement
levels. Interpret uppercase requirement words according to BCP 14 (RFC 2119 and RFC 8174):

- `MUST` or `MUST NOT`: an absolute requirement or prohibition.
- `SHOULD`: the default choice; a deviation needs a documented reason.
- `MAY`: genuinely optional.

Use these words sparingly. Prefer direct instructions for ordinary work. Do not use
`shall`.

## Technical plans

A technical plan is an execution contract. It explains what result is required, why the
work exists, what will change, how the result will be proved, and which decisions remain
open.

Plans are not transcripts of the author's reasoning. Do not include brainstorming,
discarded ideas, motivational filler, or implementation detail that does not affect a
decision or action.

### Required plan structure

Use the following headings. If a section does not apply, write `Not applicable` and give
one short reason. Do not silently omit the section.

```markdown
# <Plan title>

Status: Draft | Ready | In progress | Blocked | Complete
Last updated: YYYY-MM-DD

## Outcome

State the user-visible or operational result in one to three sentences.

## Context

Explain the current state, the problem, and why the work is needed now.

## Scope

- Included: <behavior or deliverable>
- Excluded: <explicit non-goal>

## Terms

- <term>: <one precise meaning used throughout this plan>

## Known facts and evidence

- <fact> — <file, symbol, command output, issue, or source that proves it>

## Decisions

- <decision> — <reason and consequence>

## Open questions and assumptions

- BLOCKING: <question> — <how or from whom to get the answer>
- NON-BLOCKING: <assumption> — <default choice and what would invalidate it>

## Design

Describe the component boundaries, data flow, interfaces, and failure behavior. Include a
diagram only when relationships are harder to understand in prose.

## Implementation slices

### 1. <Verb + independently verifiable result>

- Outcome: <behavior that exists after this slice>
- Changes: <specific modules, interfaces, commands, or data structures>
- Files: <known paths, or how to locate the files if paths do not exist yet>
- Dependencies: <earlier slices or external decisions>
- Validation: `<exact command>` — <expected observable result>
- Done when: <binary completion condition>

## Acceptance criteria

- AC-1: Given <starting state>, when <action>, then <observable result>.
- AC-2: <another independently testable result>.

## Validation plan

- Automated: <tests, static checks, builds, and exact commands>
- Manual: <smallest necessary manual check>
- Integration: <real or test service behavior that must be confirmed>

## Risks and recovery

- Risk: <failure mode> — Prevention: <control> — Recovery: <rollback or repair>

## Plan history

- YYYY-MM-DD: <decision or material change and why it changed>
```

### Rules for implementation slices

- Start each slice title with a verb.
- Produce an observable result in every slice. Prefer thin, end-to-end behavior over a
  sequence of disconnected layers.
- Keep one primary outcome per slice. Split a slice when it crosses multiple component
  boundaries and cannot be validated with one coherent check.
- Name exact files, commands, interfaces, environment variables, and error conditions when
  they are known.
- State the expected result of every validation command. A command without an expected
  result is incomplete.
- Include failure paths, not only the successful path.
- Keep acceptance criteria about behavior. Do not use implementation actions such as
  "create a class" as acceptance criteria.
- Link each material requirement to at least one acceptance criterion or validation step.
- Mark dependencies explicitly. Do not rely on list order alone to communicate blocking
  relationships.
- Do not assign work that depends on an unresolved `BLOCKING` question.

### Evidence and uncertainty

Separate facts, decisions, assumptions, and questions. Do not present one category as
another.

- A fact has evidence.
- A decision records a chosen direction and its consequence.
- An assumption is a temporary default that can be disproved.
- A question names missing information and a method for resolving it.

When API documentation conflicts with observed API behavior, preserve both pieces of
evidence. Treat observed behavior as a compatibility fact and open a documentation issue.
Do not silently rewrite the contract.

### Plan maintenance

Update the plan while implementation is in progress:

- Change the status when work starts, blocks, or completes.
- Record discoveries that affect scope, design, risk, or acceptance criteria.
- Add a dated history entry for material changes.
- Mark completed slices without deleting their validation evidence.
- Keep the plan aligned with the implemented result. A stale plan is not complete.

### Quality gate

Before marking a plan `Ready`, confirm all of the following:

- A reader can identify the outcome in under one minute.
- Scope and non-goals are explicit.
- Project terms have one consistent meaning.
- Every factual claim that affects the design has evidence.
- Blocking questions are resolved.
- Each slice has an observable outcome and a validation method.
- Acceptance criteria are binary and testable.
- Failure behavior, security, and recovery are addressed where relevant.
- The plan can be executed without access to the original conversation.
- A non-engineer can understand what will change and how success will be recognized.

## Basis for this writing standard

This repository applies selected guidance from the following sources:

- [ISO 24495-1:2023](https://www.iso.org/standard/78907.html): plain-language documents
  should be relevant, findable, understandable, and usable.
- [ASD-STE100 Issue 9](https://www.asd-ste100.org/): controlled technical language that
  reduces ambiguity through consistent vocabulary and writing rules.
- [W3C Cognitive Accessibility Guidance](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o3-clear-content/):
  clear words, short chunks, separated instructions, and reduced reliance on memory.
- [BCP 14](https://www.rfc-editor.org/info/bcp14): defined requirement levels for `MUST`,
  `SHOULD`, and `MAY`.
- [Job Accommodation Network guidance](https://askjan.org/disabilities/Attention-Deficit-Hyperactivity-Disorder-AD-HD.cfm):
  written instructions, checklists, task separation, and prioritization support.

These sources guide the repository style. They do not make every source a legal or
conformance requirement for this project.

## Agent skills

### Issue tracker

Work is tracked in GitHub Issues on `poamslayer/intelligrc-cli`. Verify the repository
before every issue operation. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain layout. See `docs/agents/domain.md`.

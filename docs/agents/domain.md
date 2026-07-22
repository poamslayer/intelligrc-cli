# Domain Docs

This repository uses a single-context domain-documentation layout.

## Before exploring

Read these resources when they exist:

- `CONTEXT.md` at the repository root.
- Architecture decision records that apply to the work under `docs/adr/`.

Proceed silently when either resource does not exist. Do not propose creating an empty
file. The domain-modeling skills create these files when the project has confirmed terms
or decisions to record.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

## Vocabulary

Use a domain term as defined in `CONTEXT.md`. Do not alternate between synonyms when the
glossary assigns one term to the concept.

When a needed concept is absent from the glossary, determine whether the new term is
unnecessary or the domain model has a real gap. Record a real gap for the
`/domain-modeling` skill.

## Architecture decisions

Read the architecture decision records that affect the planned work. Surface a conflict
instead of silently overriding a recorded decision.

Use this format when reporting a conflict:

> Contradicts ADR-0007 (`<decision title>`) — worth reopening because `<new evidence>`.

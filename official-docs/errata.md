# Errata: observed API behavior that the archived contract does not document

This file records conflicts between the archived OpenAPI document
(`swagger/v1/swagger.json`) and behavior observed against the live API.
The archived document stays unmodified: it is the contract of record, and
this file preserves the observed side of each conflict as a compatibility
fact.

## 1. Error responses: JSON body labeled text/plain

- Archived: the contract documents no error content type for any
  operation.
- Observed: a credential-free `GET /v1/Tenants` on
  `https://api.intelligrc.app` returns HTTP 401 with a JSON-formatted
  body labeled `content-type: text/plain`. The body is a rich envelope
  with fields including `Authorized`, `Message`, `ErrorCode`,
  `UserPermissions`, and related flags.
- Evidence: design-handoff probe on 2026-07-22, and the issue #13 live
  run on 2026-07-23 (report attached to that issue).
- CLI compensation: the request runtime parses an upstream error body as
  JSON regardless of its declared content type (issue #1 decision), so
  `error.apiError` carries the parsed envelope. `contract.test.ts` and
  the api-runtime suite cover the behavior.

## 2. Base URL

- Archived: the contract documents no host, base path, or scheme.
- Observed: `https://api.intelligrc.app` served every documented `GET`
  path during the issue #13 live run on 2026-07-23. The former
  base-URL assumption is now a verified fact; profiles still store the
  base URL so a future move needs no code release.

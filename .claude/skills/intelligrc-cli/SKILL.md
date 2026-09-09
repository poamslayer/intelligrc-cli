---
name: intelligrc-cli
description: Use the intelligrc CLI whenever the user asks to read, list, count, export, create, update, delete, or associate IntelliGRC data, or mentions intelligrc. Skip it for uploading an evidence file (POST /v1/Evidence/Upload is not implemented), and send the user to the IntelliGRC web app for that.
---

# IntelliGRC CLI

The CLI describes itself. Run `intelligrc commands` for the catalog and `intelligrc <command> --help` for flags. This skill holds only what those two lookups do not say.

## Install

Run `intelligrc version`. If the command is not found, run every command as `npx --yes @poamslayer/intelligrc-cli@0.1.1 <command>`. Keep the version pinned at `0.1.1`. A global install of the same version exposes `intelligrc`. Done when `intelligrc version` prints a version.

## Identity

Every API command needs exactly one identity source. With no source, the command exits 2 with `identity-required`.

1. A profile, named with `--profile NAME`.
2. A credentials file, named by `INTELLIGRC_CREDENTIALS_FILE`.
3. The environment identity, which is `INTELLIGRC_CLIENT_ID`, `INTELLIGRC_CLIENT_SECRET`, and `INTELLIGRC_TENANT_ID` all set.

Run `intelligrc auth status --profile NAME` (or `intelligrc auth status` with a headless source) before the first write of a session. Read `identity.source`, `secretSource`, and `overrides` from its output. Done when the source and tenant match the one the user named.

## Discover commands

`intelligrc commands` prints the full catalog as JSON. It runs offline and needs no identity. Read these fields:

- `commands[].writes`: `"remote"` changes tenant data, `"local"` changes files on this machine, `null` changes nothing.
- `commands[].operations`: the documented method and path each command sends.
- `errors`, `exitCodes`, and `env`: the failure codes, the exit codes, and the environment variables.

```bash
intelligrc commands | jq -r '.commands[] | select(.writes=="remote") | .id'   # write commands
intelligrc commands | jq -r '.commands[] | select(.writes==null) | .id'       # read commands
```

`intelligrc <command> --help` prints every flag and names the body field each flag supplies. Done when the command id and every flag you plan to pass appear in that output.

## Read data

Pass `--output json`, `--output jsonl`, or `--output table` on any API command. The default is `json`. Use `jsonl` when you pipe a list into `jq`. Records carry IDs, so run the matching `lookup` command to turn an ID into its name, e.g., `intelligrc lookup assessment-objective statuses`. Done when the output shows names, not raw IDs, to the user.

## Write data

Four rules apply to every write. Tell the user the rule that applies before you run the command.

1. A create is never retried after a network failure whose result cannot be confirmed. Check IntelliGRC for the record before you run the create again.
2. An update, a delete, and an association set are retried after a temporary failure, because a repeat lands on the same result.
3. A delete pauses for confirmation. `--force` skips the pause, so a scripted delete needs `--force`.
4. An association set replaces the whole list. Send every ID the record should keep.

Two facts the help text does not connect:

- `facility data-types set` takes its IDs from `intelligrc lookup facility data-types`. `interconnection data-types set` takes its IDs from `intelligrc data-type list`. Fetch the matching source first and keep the two ID sets apart.
- An update omits any field whose flag is absent, and the API document does not say how the API treats an omitted field. Send every field the record should keep, then read the printed record to confirm what the API stored.

Done when the printed record shows the values the user asked for.

## Failures

A failure is one JSON object on stderr, `{"error":{"code","message","retryable",...}}`, and requested data goes to stdout only. Act on `retryable`. When it is true, run the command again. When it is false, report `code` and `message` to the user. The exit codes and the full error vocabulary are in `intelligrc commands` under `exitCodes` and `errors`.

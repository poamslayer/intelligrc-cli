# IntelliGRC CLI

The vocabulary for a command-line tool that reads and edits one IntelliGRC tenant's
governance, risk, and compliance records on behalf of a person or an agent.

## Language

### Things in IntelliGRC

**Tenant**:
One customer workspace in IntelliGRC. Every API call is scoped to exactly one tenant.
_Avoid_: account, organization, client, workspace

**Resource**:
One kind of tenant record that the API exposes under its own path, such as a facility,
a data type, or a piece of evidence.
_Avoid_: entity, object, model, record type

**Lookup**:
A read-only reference table that the API serves for filling in a resource field, such as
the facility types or the boundary confidentiality levels. A lookup is not a resource.
_Avoid_: enum, option list, reference data, picklist

**Association**:
The list of records of one resource that are linked to one record of another resource,
such as the data types of a facility. An association is always read and written as a
whole list.
_Avoid_: mapping, relation, link, join

**Evaluation**:
One assessment of the tenant against a framework. Most reads are scoped to an evaluation.
_Avoid_: assessment, audit, engagement

### Things in the CLI

**Command**:
One thing the CLI can do, named as a topic followed by a verb, such as `facility get`.
_Avoid_: subcommand, action, endpoint

**Verb**:
The last word of a command name. Six verbs exist and each has one meaning:

- **get**: read one record by its identifier.
- **list**: read a collection. A narrower collection is a flag on `list`, never a new verb.
- **create**: add one record.
- **update**: change fields on one record.
- **delete**: remove one record.
- **set**: replace the whole association list on one record.

_Avoid_: show, fetch, read, view, add, new, remove, replace, put, for-

**Operation**:
One documented HTTP method and path in the vendor contract, such as `GET /v1/Facilities`.
A command sends one operation, or chooses between a small fixed set of them by the flags
supplied.
_Avoid_: endpoint, route, API call

**Contract**:
The vendor's archived OpenAPI document. It is the only authority on documented paths,
parameters, and body fields.
_Avoid_: swagger, spec, API docs

**Manifest**:
The single hand-written list of command definitions from which help text and the catalog
are derived. It is kept equal to the contract by test.
_Avoid_: schema, registry, command table

**Catalog**:
The JSON that `intelligrc commands` prints: every command with its verb, permission,
flags, operations, and whether it writes. It is derived from the manifest and needs no
credentials.
_Avoid_: introspection, capabilities, command list

**Write**:
A command that changes state. A remote write changes tenant data. A local write changes
only this machine.
_Avoid_: mutation, side effect

**Profile**:
One named, saved credential set for one tenant. The secret lives in the operating
system keychain.
_Avoid_: login, account, connection, config

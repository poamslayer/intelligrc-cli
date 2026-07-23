import assert from 'node:assert/strict'
import {test} from 'node:test'

import {runCli} from './helpers/run-cli.ts'

// Expected catalog, written out by hand from issues #2, #3, #4, #5, #6,
// #7, #8, #9, and #10. This literal is the independent source of truth;
// it must not be derived from src/manifest.ts.
const expectedCatalog = {
  catalogVersion: 1,
  commands: [
    {
      id: 'auth login',
      summary: 'Create or replace one named profile after tenant discovery.',
      kind: 'profile',
      permission: null,
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile name to create or replace.',
        },
        {
          name: 'client-id',
          type: 'option',
          required: true,
          summary: 'Client ID of the IntelliGRC API credential.',
        },
        {
          name: 'client-secret-env',
          type: 'option',
          required: false,
          summary:
            'Name of the environment variable that holds the client secret. ' +
            'Without this flag, login reads the secret from a masked prompt.',
        },
        {
          name: 'base-url',
          type: 'option',
          required: false,
          summary: 'IntelliGRC API base URL saved into the profile. HTTPS required.',
        },
        {
          name: 'replace',
          type: 'boolean',
          required: false,
          summary: 'Replace an existing profile with the same name.',
        },
      ],
    },
    {
      id: 'auth list',
      summary: 'Print profile names and non-secret settings.',
      kind: 'profile',
      permission: null,
      args: [],
      flags: [
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'auth remove',
      summary: 'Remove one named profile and its protected secret.',
      kind: 'profile',
      permission: null,
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile name to remove.',
        },
      ],
    },
    {
      id: 'commands',
      summary: 'Print the local command catalog.',
      kind: 'local',
      permission: null,
      args: [],
      flags: [
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'doctor',
      summary: 'Diagnose one profile without printing credential or tenant values.',
      kind: 'profile',
      permission: null,
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile name to diagnose.',
        },
      ],
    },
    {
      id: 'evaluation current',
      summary: 'Show the current evaluation for the profile tenant.',
      kind: 'api',
      permission: 'Evaluations: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'evaluation list',
      summary: 'List the evaluations for the profile tenant.',
      kind: 'api',
      permission: 'Evaluations: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'assessment-objective list',
      summary: 'List assessment objectives and their statuses for an evaluation.',
      kind: 'api',
      permission: 'GapAnalysis: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'evaluation-id',
          type: 'option',
          required: false,
          summary:
            'Integer evaluation identifier, sent as the documented evaluationId ' +
            'query parameter. Omitted from the request when not given.',
        },
        {
          name: 'framework-id',
          type: 'option',
          required: false,
          summary:
            'Framework identifier (UUID), sent as the documented frameworkId ' +
            'query parameter. Omitted from the request when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'assessment-objective history',
      summary: 'Show the history of one assessment objective and its statuses.',
      kind: 'api',
      permission: 'GapAnalysis: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'assessment-objective-id',
          type: 'option',
          required: true,
          summary:
            'Assessment objective identifier (UUID), sent as the documented ' +
            'assessmentObjectiveId query parameter.',
        },
        {
          name: 'evaluation-id',
          type: 'option',
          required: false,
          summary:
            'Integer evaluation identifier, sent as the documented evaluationId ' +
            'query parameter. Omitted from the request when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'control list',
      summary: 'List controls and their summary statements for an evaluation.',
      kind: 'api',
      permission: 'GapAnalysis: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'evaluation-id',
          type: 'option',
          required: false,
          summary:
            'Integer evaluation identifier, sent as the documented evaluationId ' +
            'query parameter. Omitted from the request when not given.',
        },
        {
          name: 'framework-id',
          type: 'option',
          required: false,
          summary:
            'Framework identifier (UUID), sent as the documented frameworkId ' +
            'query parameter. Omitted from the request when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'evidence for-evaluation',
      summary: 'List uploaded evidence for an evaluation.',
      kind: 'api',
      permission: 'Evidence: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'evaluation-id',
          type: 'option',
          required: false,
          summary:
            'Integer evaluation identifier, sent as the documented evaluationId ' +
            'query parameter. Omitted from the request when not given.',
        },
        {
          name: 'framework-id',
          type: 'option',
          required: false,
          summary:
            'Framework identifier (UUID), sent as the documented frameworkId ' +
            'query parameter. Omitted from the request when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'evidence list',
      summary: 'List all uploaded evidence for the profile tenant.',
      kind: 'api',
      permission: 'Evidence: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'evidence-folder list',
      summary: 'List evidence folders, optionally under one parent folder.',
      kind: 'api',
      permission: 'Evidence: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'parent-id',
          type: 'option',
          required: false,
          summary:
            'Parent folder identifier (UUID), sent as the documented parentId ' +
            'query parameter. Omitted from the request when not given, which ' +
            'lists all folders.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'action-plan-project list',
      summary: 'List action-plan projects for an evaluation.',
      kind: 'api',
      permission: 'ActionPlan: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'evaluation-id',
          type: 'option',
          required: false,
          summary:
            'Integer evaluation identifier, sent as the documented evaluationId ' +
            'query parameter. Omitted from the request when not given.',
        },
        {
          name: 'include-tasks',
          type: 'option',
          required: false,
          allowedValues: ['true', 'false'],
          summary:
            'Explicit true or false, sent as the documented includeTasks ' +
            'query parameter. Omitted from the request when not given, so ' +
            'the server applies its documented default (true).',
        },
        {
          name: 'include-subtasks',
          type: 'option',
          required: false,
          allowedValues: ['true', 'false'],
          summary:
            'Explicit true or false, sent as the documented includeSubTasks ' +
            'query parameter. Omitted from the request when not given, so ' +
            'the server applies its documented default (true).',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'action-plan-task list',
      summary: 'List action-plan tasks for an evaluation.',
      kind: 'api',
      permission: 'ActionPlan: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'evaluation-id',
          type: 'option',
          required: false,
          summary:
            'Integer evaluation identifier, sent as the documented evaluationId ' +
            'query parameter. Omitted from the request when not given.',
        },
        {
          name: 'include-subtasks',
          type: 'option',
          required: false,
          allowedValues: ['true', 'false'],
          summary:
            'Explicit true or false, sent as the documented includeSubTasks ' +
            'query parameter. Omitted from the request when not given, so ' +
            'the server applies its documented default (true).',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'action-plan-subtask list',
      summary: 'List action-plan subtasks for an evaluation.',
      kind: 'api',
      permission: 'ActionPlan: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'evaluation-id',
          type: 'option',
          required: false,
          summary:
            'Integer evaluation identifier, sent as the documented evaluationId ' +
            'query parameter. Omitted from the request when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'boundary list',
      summary: 'List the boundaries (systems) for the profile tenant.',
      kind: 'api',
      permission: 'Boundaries: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'data-type get',
      summary: 'Show one data type by its integer identifier.',
      kind: 'api',
      permission: 'DataTypes: Read',
      args: [
        {
          name: 'id',
          type: 'integer',
          required: true,
          summary: 'Integer data type identifier, substituted into the documented request path.',
        },
      ],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'data-type list',
      summary: 'List the data types for the profile tenant.',
      kind: 'api',
      permission: 'DataTypes: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'data-type create',
      summary: 'Create one data type for the profile tenant.',
      kind: 'api',
      permission: 'DataTypes: Write',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'name',
          type: 'option',
          required: true,
          summary: 'Data type name, sent as the required "name" body field.',
        },
        {
          name: 'description',
          type: 'option',
          required: false,
          summary:
            'Optional data type description, sent as the "description" body field. ' +
            'Omitted from the body when not given.',
        },
        {
          name: 'confidentiality-id',
          type: 'option',
          required: true,
          summary:
            'Integer confidentiality level identifier from ' +
            '`lookup data-type confidentiality-levels`, sent as the required ' +
            '"confidentialityId" body field.',
        },
        {
          name: 'integrity-id',
          type: 'option',
          required: true,
          summary:
            'Integer integrity level identifier from ' +
            '`lookup data-type integrity-levels`, sent as the required ' +
            '"integrityId" body field.',
        },
        {
          name: 'availability-id',
          type: 'option',
          required: true,
          summary:
            'Integer availability level identifier from ' +
            '`lookup data-type availability-levels`, sent as the required ' +
            '"availabilityId" body field.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'data-type update',
      summary: 'Update one data type by its integer identifier.',
      kind: 'api',
      permission: 'DataTypes: Write',
      args: [
        {
          name: 'id',
          type: 'integer',
          required: true,
          summary: 'Integer data type identifier, substituted into the documented request path.',
        },
      ],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'name',
          type: 'option',
          required: true,
          summary: 'Data type name, sent as the required "name" body field.',
        },
        {
          name: 'description',
          type: 'option',
          required: false,
          summary:
            'Optional data type description, sent as the "description" body field. ' +
            'Omitted from the body when not given.',
        },
        {
          name: 'confidentiality-id',
          type: 'option',
          required: true,
          summary:
            'Integer confidentiality level identifier from ' +
            '`lookup data-type confidentiality-levels`, sent as the required ' +
            '"confidentialityId" body field.',
        },
        {
          name: 'integrity-id',
          type: 'option',
          required: true,
          summary:
            'Integer integrity level identifier from ' +
            '`lookup data-type integrity-levels`, sent as the required ' +
            '"integrityId" body field.',
        },
        {
          name: 'availability-id',
          type: 'option',
          required: true,
          summary:
            'Integer availability level identifier from ' +
            '`lookup data-type availability-levels`, sent as the required ' +
            '"availabilityId" body field.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'data-type delete',
      summary: 'Delete one data type by its integer identifier, after a confirmation pause.',
      kind: 'api',
      permission: 'DataTypes: Write',
      args: [
        {
          name: 'id',
          type: 'integer',
          required: true,
          summary: 'Integer data type identifier, substituted into the documented request path.',
        },
      ],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'yes',
          type: 'boolean',
          required: false,
          summary: 'Skip the delete confirmation prompt and delete without pausing.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'facility list',
      summary: 'List the facilities for the profile tenant.',
      kind: 'api',
      permission: 'Locations: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'facility get',
      summary: 'Show one facility by its integer identifier.',
      kind: 'api',
      permission: 'Locations: Read',
      args: [
        {
          name: 'id',
          type: 'integer',
          required: true,
          summary: 'Integer facility identifier, substituted into the documented request path.',
        },
      ],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'facility data-types',
      summary: 'List the data types associated with one facility.',
      kind: 'api',
      permission: 'Locations: Read',
      args: [
        {
          name: 'id',
          type: 'integer',
          required: true,
          summary: 'Integer facility identifier, substituted into the documented request path.',
        },
      ],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'interconnection list',
      summary: 'List the interconnections for the profile tenant.',
      kind: 'api',
      permission: 'Interconnections: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'interconnection get',
      summary: 'Show one interconnection by its integer identifier.',
      kind: 'api',
      permission: 'Interconnections: Read',
      args: [
        {
          name: 'id',
          type: 'integer',
          required: true,
          summary:
            'Integer interconnection identifier, substituted into the documented request path.',
        },
      ],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'interconnection data-types',
      summary: 'List the data types associated with one interconnection.',
      kind: 'api',
      permission: 'Interconnections: Read',
      args: [
        {
          name: 'id',
          type: 'integer',
          required: true,
          summary:
            'Integer interconnection identifier, substituted into the documented request path.',
        },
      ],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'personnel list',
      summary: 'List the personnel for the profile tenant.',
      kind: 'api',
      permission: 'Personnel: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'personnel get',
      summary: 'Show one person by their integer identifier.',
      kind: 'api',
      permission: 'Personnel: Read',
      args: [
        {
          name: 'id',
          type: 'integer',
          required: true,
          summary: 'Integer personnel identifier, substituted into the documented request path.',
        },
      ],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup action-plan project-statuses',
      summary: 'List the action-plan project status options.',
      kind: 'api',
      permission: 'ActionPlan: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup action-plan task-statuses',
      summary: 'List the action-plan task status options.',
      kind: 'api',
      permission: 'ActionPlan: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup action-plan subtask-statuses',
      summary: 'List the action-plan subtask status options.',
      kind: 'api',
      permission: 'ActionPlan: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup action-plan task-types',
      summary: 'List the action-plan task type options.',
      kind: 'api',
      permission: 'ActionPlan: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup action-plan levels-of-effort',
      summary: 'List the action-plan level of effort options.',
      kind: 'api',
      permission: 'ActionPlan: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup action-plan priority-levels',
      summary: 'List the action-plan priority level options.',
      kind: 'api',
      permission: 'ActionPlan: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup action-plan categories',
      summary: 'List the action-plan category options.',
      kind: 'api',
      permission: 'ActionPlan: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup action-plan subcategories',
      summary: 'List the action-plan subcategory options.',
      kind: 'api',
      permission: 'ActionPlan: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup assessment-objective statuses',
      summary: 'List the assessment objective status options.',
      kind: 'api',
      permission: 'GapAnalysis: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup boundary operational-statuses',
      summary: 'List the boundary operational status options.',
      kind: 'api',
      permission: 'Boundaries: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup boundary information-system-types',
      summary: 'List the boundary information system type options.',
      kind: 'api',
      permission: 'Boundaries: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup boundary confidentiality-levels',
      summary: 'List the boundary confidentiality level options.',
      kind: 'api',
      permission: 'Boundaries: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup boundary integrity-levels',
      summary: 'List the boundary integrity level options.',
      kind: 'api',
      permission: 'Boundaries: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup boundary availability-levels',
      summary: 'List the boundary availability level options.',
      kind: 'api',
      permission: 'Boundaries: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup data-type confidentiality-levels',
      summary: 'List the data-type confidentiality level options.',
      kind: 'api',
      permission: 'DataTypes: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup data-type integrity-levels',
      summary: 'List the data-type integrity level options.',
      kind: 'api',
      permission: 'DataTypes: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup data-type availability-levels',
      summary: 'List the data-type availability level options.',
      kind: 'api',
      permission: 'DataTypes: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup facility types',
      summary: 'List the facility type options.',
      kind: 'api',
      permission: 'Locations: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup facility states',
      summary: 'List the supported US state and territory options for facilities.',
      kind: 'api',
      permission: 'Locations: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup facility data-types',
      summary: 'List the data type options that can be associated with a facility.',
      kind: 'api',
      permission: 'Locations: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup facility asset-categories',
      summary: 'List the asset category options that can be associated with a facility.',
      kind: 'api',
      permission: 'Locations: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup interconnection types',
      summary: 'List the interconnection type options, each with its sub-types.',
      kind: 'api',
      permission: 'Interconnections: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup interconnection authorization-types',
      summary: 'List the authorization type options for interconnections.',
      kind: 'api',
      permission: 'Interconnections: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup interconnection asset-categories',
      summary:
        'List the asset category options that can be associated with an interconnection.',
      kind: 'api',
      permission: 'Interconnections: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup icl-version list',
      summary: 'List the published Intelligent Control Library versions.',
      kind: 'api',
      permission: 'Evaluations: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup icl-version latest-frameworks',
      summary: 'List published frameworks for the latest Intelligent Control Library version.',
      kind: 'api',
      permission: 'Evaluations: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'lookup icl-version frameworks',
      summary: 'List published frameworks for one Intelligent Control Library version.',
      kind: 'api',
      permission: 'Evaluations: Read',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'icl-version-id',
          type: 'option',
          required: true,
          summary:
            'Intelligent Control Library version identifier (UUID), substituted ' +
            'into the documented request path.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'tenant list',
      summary: 'List the tenants manageable by the profile credential.',
      kind: 'api',
      permission: null,
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential and base URL.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'version',
      summary: 'Print the installed package version.',
      kind: 'local',
      permission: null,
      args: [],
      flags: [],
    },
  ],
}

test('commands --output json emits the full catalog as valid JSON', async () => {
  const result = await runCli(['commands', '--output', 'json'])

  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), expectedCatalog)
})

test('commands defaults to JSON output when --output is omitted', async () => {
  const explicit = await runCli(['commands', '--output', 'json'])
  const defaulted = await runCli(['commands'])

  assert.equal(defaulted.code, 0)
  assert.equal(defaulted.stdout, explicit.stdout)
})

test('commands rejects an unsupported output format with exit code 2', async () => {
  const result = await runCli(['commands', '--output', 'yaml'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
})

test('commands ignores a .env file in the working directory', async () => {
  const {mkdtempSync, writeFileSync} = await import('node:fs')
  const {tmpdir} = await import('node:os')
  const {join} = await import('node:path')

  const poisonedCwd = mkdtempSync(join(tmpdir(), 'intelligrc-env-test-'))
  writeFileSync(
    join(poisonedCwd, '.env'),
    'INTELLIGRC_BASE_URL=http://127.0.0.1:1\nINTELLIGRC_CLIENT_ID=poisoned\n',
  )

  const clean = await runCli(['commands', '--output', 'json'])
  const poisoned = await runCli(['commands', '--output', 'json'], {cwd: poisonedCwd})

  assert.equal(poisoned.code, 0)
  assert.equal(poisoned.stdout, clean.stdout)
  assert.equal(poisoned.stderr, '')
})

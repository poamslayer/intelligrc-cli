import assert from 'node:assert/strict'
import {test} from 'node:test'

import {runCli} from './helpers/run-cli.ts'

// The fourteen body flags both facility write commands expose, written out by
// hand from the archived FacilityCreateDTO and FacilityUpdateDTO. The two DTOs
// document the same field names and the same required set (only `name`), so
// one literal states the flag expectation for both commands. The DTOs differ
// in three create-only string constraints, which the summaries below attribute
// to the create field. Like the rest of this file, this literal is
// hand-written and must not be derived from src/manifest.ts.
const facilityWriteFlags = [
  {
    name: 'name',
    type: 'option',
    required: true,
    summary: 'Facility name, sent as the required "name" body field.',
  },
  {
    name: 'description',
    type: 'option',
    required: false,
    summary:
      'Optional facility description, sent as the "description" body field. ' +
      'Omitted from the body when not given.',
  },
  {
    name: 'location-type-id',
    type: 'option',
    required: false,
    summary:
      'Integer facility type identifier from `lookup facility types`, sent as ' +
      'the "locationTypeId" body field. Omitted from the body when not given.',
  },
  {
    name: 'address',
    type: 'option',
    required: false,
    summary:
      'Optional street address, sent as the "address" body field. Omitted ' +
      'from the body when not given.',
  },
  {
    name: 'address-line2',
    type: 'option',
    required: false,
    summary:
      'Optional second address line, sent as the "addressLine2" body field. ' +
      'Omitted from the body when not given.',
  },
  {
    name: 'city',
    type: 'option',
    required: false,
    summary: 'Optional city, sent as the "city" body field. Omitted from the body when not given.',
  },
  {
    name: 'state',
    type: 'option',
    required: false,
    summary:
      'Optional state, sent as the "state" body field. The documented create ' +
      'field holds at most two characters, for example TX. Omitted from the ' +
      'body when not given.',
  },
  {
    name: 'zip-code',
    type: 'option',
    required: false,
    summary:
      'Optional postal code, sent as the "zipCode" body field. The documented ' +
      'create field holds five digits or five-plus-four digits, for example ' +
      '78701 or 78701-1234. Omitted from the body when not given.',
  },
  {
    name: 'country',
    type: 'option',
    required: false,
    summary:
      'Optional country, sent as the "country" body field. Omitted from the ' +
      'body when not given.',
  },
  {
    name: 'phone-number',
    type: 'option',
    required: false,
    summary:
      'Optional telephone number, sent as the "phoneNumber" body field. ' +
      'Omitted from the body when not given.',
  },
  {
    name: 'website',
    type: 'option',
    required: false,
    summary:
      'Optional website address, sent as the "website" body field. The ' +
      'documented create field holds a uniform resource identifier (URI), for ' +
      'example https://example.com. Omitted from the body when not given.',
  },
  {
    name: 'fax-number',
    type: 'option',
    required: false,
    summary:
      'Optional fax number, sent as the "faxNumber" body field. Omitted from ' +
      'the body when not given.',
  },
  {
    name: 'employee-count',
    type: 'option',
    required: false,
    summary:
      'Integer number of employees at the facility, sent as the ' +
      '"employeeCount" body field. Omitted from the body when not given.',
  },
  {
    name: 'primary-contact-id',
    type: 'option',
    required: false,
    summary:
      'Integer personnel identifier of the primary contact from ' +
      '`personnel list`, sent as the "primaryContactId" body field. Omitted ' +
      'from the body when not given.',
  },
]

// The twelve body flags both personnel write commands expose, written out by
// hand from the archived PersonnelCreateDTO and PersonnelUpdateDTO. The two
// DTOs document the identical field names, types, and required set
// (`firstName` and `lastName`), so one literal states the flag expectation for
// both commands. Like the rest of this file, this literal is hand-written and
// must not be derived from src/manifest.ts.
const personnelWriteFlags = [
  {
    name: 'first-name',
    type: 'option',
    required: true,
    summary: 'Given name, sent as the required "firstName" body field.',
  },
  {
    name: 'last-name',
    type: 'option',
    required: true,
    summary: 'Family name, sent as the required "lastName" body field.',
  },
  {
    name: 'middle-name',
    type: 'option',
    required: false,
    summary:
      'Optional middle name, sent as the "middleName" body field. Omitted ' +
      'from the body when not given.',
  },
  {
    name: 'title',
    type: 'option',
    required: false,
    summary:
      'Optional job title, sent as the "title" body field. Omitted from the ' +
      'body when not given.',
  },
  {
    name: 'description',
    type: 'option',
    required: false,
    summary:
      'Optional description of the person, sent as the "description" body ' +
      'field. Omitted from the body when not given.',
  },
  {
    name: 'email-address',
    type: 'option',
    required: false,
    summary:
      'Optional email address, sent as the "emailAddress" body field. Omitted ' +
      'from the body when not given.',
  },
  {
    name: 'phone-number',
    type: 'option',
    required: false,
    summary:
      'Optional telephone number, sent as the "phoneNumber" body field. ' +
      'Omitted from the body when not given.',
  },
  {
    name: 'office-number',
    type: 'option',
    required: false,
    summary:
      'Optional office number, sent as the "officeNumber" body field. Omitted ' +
      'from the body when not given.',
  },
  {
    name: 'network-user-name',
    type: 'option',
    required: false,
    summary:
      'Optional network user name, sent as the "networkUserName" body field. ' +
      'Omitted from the body when not given.',
  },
  {
    name: 'department-cd',
    type: 'option',
    required: false,
    summary:
      'Optional department code, sent as the documented "department_CD" body ' +
      'field. Omitted from the body when not given.',
  },
  {
    name: 'ad-domain',
    type: 'option',
    required: false,
    summary:
      'Optional directory domain, sent as the "adDomain" body field. Omitted ' +
      'from the body when not given.',
  },
  {
    name: 'user-type-id',
    type: 'option',
    required: false,
    summary:
      'Integer user type identifier, sent as the "userTypeId" body field. The ' +
      'archived contract documents no lookup operation for the user type ' +
      'options. Omitted from the body when not given.',
  },
]

// Expected catalog, written out by hand from issues #2, #3, #4, #5, #6,
// #7, #8, #9, and #10. This literal is the independent source of truth;
// it must not be derived from src/manifest.ts.
const expectedCatalog = {
  catalogVersion: 3,
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
      summary: 'Get the current evaluation for the profile tenant.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'evaluation create',
      summary: 'Create one evaluation for the profile tenant.',
      kind: 'api',
      permission: 'Evaluations: Write',
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
          summary: 'Evaluation name, sent as the required "name" body field.',
        },
        {
          name: 'reason',
          type: 'option',
          required: true,
          summary: 'Reason for the evaluation, sent as the required "reason" body field.',
        },
        {
          name: 'boundary-id',
          type: 'option',
          required: true,
          summary:
            'Integer boundary identifier from `boundary list`, sent as the required ' +
            '"boundaryId" body field.',
        },
        {
          name: 'start-date',
          type: 'option',
          required: true,
          summary:
            'Evaluation start date in YYYY-MM-DD form, sent as the required ' +
            '"startDate" date-time body field at midnight UTC.',
        },
        {
          name: 'end-date',
          type: 'option',
          required: true,
          summary:
            'Evaluation end date in YYYY-MM-DD form, sent as the required "endDate" ' +
            'date-time body field at midnight UTC.',
        },
        {
          name: 'total-budget',
          type: 'option',
          required: false,
          summary:
            'Optional total budget number (for example 50000 or 50000.50), sent as ' +
            'the "totalBudget" body field. Omitted from the body when not given.',
        },
        {
          name: 'icl-version-id',
          type: 'option',
          required: true,
          summary:
            'Intelligent Control Library version identifier (UUID) from ' +
            '`lookup icl-version list`, sent as the required "iclVersionId" body field.',
        },
        {
          name: 'framework-id',
          type: 'option',
          required: true,
          multiple: true,
          summary:
            'Framework identifier (UUID) to assess, from ' +
            '`lookup icl-version frameworks`. Repeat the flag to assess more than one, ' +
            'for example --framework-id <uuid> --framework-id <uuid>. Each value ' +
            'becomes one element of the required "frameworkIds" array body field.',
        },
        {
          name: 'target-type',
          type: 'option',
          required: false,
          summary:
            'Optional integer target type identifier, sent as the "targetType" body ' +
            'field. The documented field is an integer, not free text. Omitted from ' +
            'the body when not given.',
        },
        {
          name: 'previous-evaluation-id',
          type: 'option',
          required: false,
          summary:
            'Optional integer identifier of the previous evaluation, sent as the ' +
            '"previousEvaluationId" body field. Omitted from the body when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'assessment-objective history',
      summary: 'Get the history of one assessment objective and its statuses.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'assessment-objective update',
      summary: 'Update one assessment objective by its identifier.',
      kind: 'api',
      permission: 'GapAnalysis: Write',
      args: [
        {
          name: 'id',
          type: 'string',
          required: true,
          summary:
            'Assessment objective identifier (UUID), substituted into the documented request path.',
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
          name: 'evaluation-id',
          type: 'option',
          required: false,
          summary:
            'Integer evaluation identifier, sent as the optional "evaluationId" body ' +
            'field. Omitted from the body when not given.',
        },
        {
          name: 'status-id',
          type: 'option',
          required: false,
          summary:
            'Integer status identifier from `lookup assessment-objective statuses`, ' +
            'sent as the optional "statusId" body field. Omitted from the body when ' +
            'not given.',
        },
        {
          name: 'implementation-detail',
          type: 'option',
          required: false,
          summary:
            'Implementation detail text, sent as the optional "implementationDetail" ' +
            'body field. Omitted from the body when not given.',
        },
        {
          name: 'finding-detail',
          type: 'option',
          required: false,
          summary:
            'Finding detail text, sent as the optional "findingDetail" body field. ' +
            'Omitted from the body when not given.',
        },
        {
          name: 'recommendation-detail',
          type: 'option',
          required: false,
          summary:
            'Recommendation detail text, sent as the optional "recommendationDetail" ' +
            'body field. Omitted from the body when not given.',
        },
        {
          name: 'validation-methods',
          type: 'option',
          required: false,
          summary:
            'Validation methods text, sent as the optional "validationMethods" body ' +
            'field. The documented field is a single string, not a list. Omitted from ' +
            'the body when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'control update',
      summary: 'Update the summary statement and evaluation of one control by its identifier.',
      kind: 'api',
      permission: 'GapAnalysis: Write',
      args: [
        {
          name: 'id',
          type: 'string',
          required: true,
          summary: 'Control identifier (UUID), substituted into the documented request path.',
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
          name: 'evaluation-id',
          type: 'option',
          required: false,
          summary:
            'Integer evaluation identifier, sent as the optional "evaluationId" body ' +
            'field. Omitted from the body when not given.',
        },
        {
          name: 'summary-statement',
          type: 'option',
          required: false,
          summary:
            'Summary statement (implementation detail) text, sent as the optional ' +
            '"summaryStatement" body field. Omitted from the body when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'evidence list',
      summary: 'List uploaded evidence for the profile tenant, or for one evaluation.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'evidence assessment-objectives set',
      summary: 'Set the assessment objectives mapped to one piece of evidence.',
      kind: 'api',
      permission: 'Evidence: Write',
      args: [
        {
          name: 'id',
          type: 'string',
          required: true,
          summary: 'Evidence identifier (UUID), substituted into the documented request path.',
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
          name: 'assessment-objective-id',
          type: 'option',
          required: true,
          multiple: true,
          summary:
            'Assessment objective identifier (UUID) to map to the evidence. Repeat the ' +
            'flag to map more than one, for example --assessment-objective-id <uuid> ' +
            '--assessment-objective-id <uuid>. Each value becomes one element of the ' +
            'required "assessmentObjectiveIds" array body field.',
        },
        {
          name: 'preserve-existing',
          type: 'option',
          required: false,
          allowedValues: ['true', 'false'],
          summary:
            'Explicit true or false, sent as the documented preserveExisting query ' +
            'parameter. true adds the given objectives to the existing mappings; ' +
            'omit the flag or pass false to replace all existing mappings (the ' +
            'documented default).',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'evidence create',
      summary: 'Create one piece of link-based evidence for the profile tenant.',
      kind: 'api',
      permission: 'Evidence: Write',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'file-name',
          type: 'option',
          required: true,
          summary: 'Display name for the evidence, sent as the required "fileName" body field.',
        },
        {
          name: 'url',
          type: 'option',
          required: true,
          summary:
            'Web address the evidence links to, sent as the required "url" body ' +
            'field. The documented field holds a uniform resource identifier (URI), ' +
            'for example https://example.com/policy.pdf.',
        },
        {
          name: 'description',
          type: 'option',
          required: false,
          summary:
            'Optional description of the evidence, sent as the "description" body ' +
            'field. Omitted from the body when not given.',
        },
        {
          name: 'parent-id',
          type: 'option',
          required: false,
          summary:
            'Parent folder identifier (UUID) from `evidence-folder list`, sent as the ' +
            '"parentId" body field. Omitted from the body when not given. The ' +
            'documented folder operation treats a null parent as the root; the ' +
            'documented evidence operation states no rule for a null parent.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'evidence-folder create',
      summary: 'Create one evidence folder for the profile tenant.',
      kind: 'api',
      permission: 'Evidence: Write',
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
          summary: 'Folder name, sent as the required "name" body field.',
        },
        {
          name: 'parent-id',
          type: 'option',
          required: false,
          summary:
            'Parent folder identifier (UUID) from `evidence-folder list`, sent as the ' +
            '"parentId" body field. Omitted from the body when not given. The ' +
            'documented folder operation treats a null parent as the root; the ' +
            'documented evidence operation states no rule for a null parent.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'action-plan-project create',
      summary: 'Create one action-plan project for the profile tenant.',
      kind: 'api',
      permission: 'ActionPlan: Write',
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
          summary: 'Name, sent as the required "name" body field.',
        },
        {
          name: 'description',
          type: 'option',
          required: true,
          summary: 'Description, sent as the required "description" body field.',
        },
        {
          name: 'status-id',
          type: 'option',
          required: true,
          summary: 'Integer status identifier from `lookup action-plan project-statuses`, sent as the required "statusId" body field.',
        },
        {
          name: 'cost-estimate',
          type: 'option',
          required: false,
          summary: 'Optional cost estimate number (for example 50000 or 50000.50), sent as the "costEstimate" body field. Omitted from the body when not given.',
        },
        {
          name: 'due-date',
          type: 'option',
          required: false,
          summary: 'Optional due date in YYYY-MM-DD form, sent as the "dueDate" date-time body field at midnight UTC. Omitted from the body when not given.',
        },
        {
          name: 'evaluation-id',
          type: 'option',
          required: false,
          summary: 'Optional integer evaluation identifier, sent as the "evaluationId" body field. Omitted from the body when not given.',
        },
        {
          name: 'assigned-department-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer department identifier to assign. Repeat the flag to assign more than one. Each value becomes one element of the "assignedDepartmentIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'assigned-personnel-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer personnel identifier to assign. Repeat the flag to assign more than one. Each value becomes one element of the "assignedPersonnelIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'assigned-watcher-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer watcher personnel identifier to assign. Repeat the flag to assign more than one. Each value becomes one element of the "assignedWatcherIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'level-of-effort-id',
          type: 'option',
          required: false,
          summary: 'Optional integer level of effort identifier from `lookup action-plan levels-of-effort`, sent as the "levelOfEffortId" body field. Omitted from the body when not given.',
        },
        {
          name: 'priority-level-id',
          type: 'option',
          required: false,
          summary: 'Optional integer priority level identifier from `lookup action-plan priority-levels`, sent as the "priorityLevelId" body field. Omitted from the body when not given.',
        },
        {
          name: 'sub-category-id',
          type: 'option',
          required: false,
          summary: 'Optional integer subcategory identifier from `lookup action-plan subcategories`, sent as the "subCategoryId" body field. Omitted from the body when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'action-plan-task create',
      summary: 'Create one action-plan task for the profile tenant.',
      kind: 'api',
      permission: 'ActionPlan: Write',
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
          summary: 'Name, sent as the required "name" body field.',
        },
        {
          name: 'description',
          type: 'option',
          required: true,
          summary: 'Description, sent as the required "description" body field.',
        },
        {
          name: 'status-id',
          type: 'option',
          required: true,
          summary: 'Integer status identifier from `lookup action-plan task-statuses`, sent as the required "statusId" body field.',
        },
        {
          name: 'task-type-id',
          type: 'option',
          required: true,
          summary: 'Integer task type identifier from `lookup action-plan task-types`, sent as the required "taskTypeId" body field.',
        },
        {
          name: 'budget',
          type: 'option',
          required: false,
          summary: 'Optional budget number (for example 50000 or 50000.50), sent as the "budget" body field. Omitted from the body when not given.',
        },
        {
          name: 'scheduled-completion-date',
          type: 'option',
          required: false,
          summary: 'Optional scheduled completion date in YYYY-MM-DD form, sent as the "scheduledCompletionDate" date-time body field at midnight UTC. Omitted from the body when not given.',
        },
        {
          name: 'project-id',
          type: 'option',
          required: false,
          summary: 'Optional project identifier (UUID) from `action-plan-project list`, sent as the "projectId" body field. Omitted from the body when not given.',
        },
        {
          name: 'evaluation-id',
          type: 'option',
          required: false,
          summary: 'Optional integer evaluation identifier, sent as the "evaluationId" body field. Omitted from the body when not given.',
        },
        {
          name: 'assigned-department-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer department identifier to assign. Repeat the flag to assign more than one. Each value becomes one element of the "assignedDepartmentIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'assigned-personnel-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer personnel identifier to assign. Repeat the flag to assign more than one. Each value becomes one element of the "assignedPersonnelIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'assigned-watcher-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer watcher personnel identifier to assign. Repeat the flag to assign more than one. Each value becomes one element of the "assignedWatcherIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'assigned-assessment-objective-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Assessment objective identifier (UUID) to assign. Repeat the flag to assign more than one. Each value becomes one element of the "assignedAssessmentObjectiveIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'level-of-effort-id',
          type: 'option',
          required: false,
          summary: 'Optional integer level of effort identifier from `lookup action-plan levels-of-effort`, sent as the "levelOfEffortId" body field. Omitted from the body when not given.',
        },
        {
          name: 'priority-level-id',
          type: 'option',
          required: false,
          summary: 'Optional integer priority level identifier from `lookup action-plan priority-levels`, sent as the "priorityLevelId" body field. Omitted from the body when not given.',
        },
        {
          name: 'sub-category-id',
          type: 'option',
          required: false,
          summary: 'Optional integer subcategory identifier from `lookup action-plan subcategories`, sent as the "subCategoryId" body field. Omitted from the body when not given.',
        },
        {
          name: 'is-assigned-to-organization',
          type: 'option',
          required: false,
          allowedValues: ['true', 'false'],
          summary: 'Optional true or false, sent as the "isAssignedToOrganization" body field. Omitted from the body when not given.',
        },
        {
          name: 'assigned-external-organization',
          type: 'option',
          required: false,
          summary: 'Optional external organization name, sent as the "assignedExternalOrganization" body field. Omitted from the body when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'action-plan-subtask create',
      summary: 'Create one action-plan subtask for the profile tenant.',
      kind: 'api',
      permission: 'ActionPlan: Write',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        {
          name: 'title',
          type: 'option',
          required: true,
          summary: 'Subtask title, sent as the required "title" body field.',
        },
        {
          name: 'description',
          type: 'option',
          required: true,
          summary: 'Description, sent as the required "description" body field.',
        },
        {
          name: 'task-id',
          type: 'option',
          required: true,
          summary: 'Task identifier (UUID) from `action-plan-task list`, sent as the required "taskId" body field.',
        },
        {
          name: 'status-id',
          type: 'option',
          required: true,
          summary: 'Integer status identifier from `lookup action-plan subtask-statuses`, sent as the required "statusId" body field.',
        },
        {
          name: 'cost-estimate',
          type: 'option',
          required: false,
          summary: 'Optional cost estimate number (for example 50000 or 50000.50), sent as the "costEstimate" body field. Omitted from the body when not given.',
        },
        {
          name: 'scheduled-completion-date',
          type: 'option',
          required: false,
          summary: 'Optional scheduled completion date in YYYY-MM-DD form, sent as the "scheduledCompletionDate" date-time body field at midnight UTC. Omitted from the body when not given.',
        },
        {
          name: 'assigned-department-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer department identifier to assign. Repeat the flag to assign more than one. Each value becomes one element of the "assignedDepartmentIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'assigned-personnel-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer personnel identifier to assign. Repeat the flag to assign more than one. Each value becomes one element of the "assignedPersonnelIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'assigned-watcher-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer watcher personnel identifier to assign. Repeat the flag to assign more than one. Each value becomes one element of the "assignedWatcherIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'level-of-effort-id',
          type: 'option',
          required: false,
          summary: 'Optional integer level of effort identifier from `lookup action-plan levels-of-effort`, sent as the "levelOfEffortId" body field. Omitted from the body when not given.',
        },
        {
          name: 'priority-level-id',
          type: 'option',
          required: false,
          summary: 'Optional integer priority level identifier from `lookup action-plan priority-levels`, sent as the "priorityLevelId" body field. Omitted from the body when not given.',
        },
        {
          name: 'sub-category-id',
          type: 'option',
          required: false,
          summary: 'Optional integer subcategory identifier from `lookup action-plan subcategories`, sent as the "subCategoryId" body field. Omitted from the body when not given.',
        },
        {
          name: 'is-assigned-to-organization',
          type: 'option',
          required: false,
          allowedValues: ['true', 'false'],
          summary: 'Optional true or false, sent as the "isAssignedToOrganization" body field. Omitted from the body when not given.',
        },
        {
          name: 'assigned-external-organization',
          type: 'option',
          required: false,
          summary: 'Optional external organization name, sent as the "assignedExternalOrganization" body field. Omitted from the body when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'boundary create',
      summary: 'Create one boundary (system) for the profile tenant.',
      kind: 'api',
      permission: 'Boundaries: Write',
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
          summary: 'Boundary name, sent as the required "name" body field.',
        },
        {
          name: 'unique-identifier',
          type: 'option',
          required: true,
          summary: 'Boundary unique identifier, sent as the required "uniqueIdentifier" body field.',
        },
        {
          name: 'operational-status-id',
          type: 'option',
          required: true,
          summary: 'Integer operational status identifier from `lookup boundary operational-statuses`, sent as the required "operationalStatusId" body field.',
        },
        {
          name: 'system-type-id',
          type: 'option',
          required: true,
          summary: 'Integer system type identifier, sent as the required "systemTypeId" body field.',
        },
        {
          name: 'description',
          type: 'option',
          required: false,
          summary: 'Optional boundary description, sent as the "description" body field. Omitted from the body when not given.',
        },
        {
          name: 'system-environment',
          type: 'option',
          required: false,
          summary: 'Optional system environment, sent as the "systemEnvironment" body field. Omitted from the body when not given.',
        },
        {
          name: 'network-architecture-details',
          type: 'option',
          required: false,
          summary: 'Optional network architecture details, sent as the "networkArchitectureDetails" body field. Omitted from the body when not given.',
        },
        {
          name: 'operational-status-details',
          type: 'option',
          required: false,
          summary: 'Optional operational status details, sent as the "operationalStatusDetails" body field. Omitted from the body when not given.',
        },
        {
          name: 'information-system-type-id',
          type: 'option',
          required: false,
          summary: 'Optional integer information system type identifier from `lookup boundary information-system-types`, sent as the "informationSystemTypeId" body field. Omitted from the body when not given.',
        },
        {
          name: 'information-system-type-details',
          type: 'option',
          required: false,
          summary: 'Optional information system type details, sent as the "informationSystemTypeDetails" body field. Omitted from the body when not given.',
        },
        {
          name: 'confidentiality-id',
          type: 'option',
          required: false,
          summary: 'Optional integer confidentiality level identifier from `lookup boundary confidentiality-levels`, sent as the "confidentialityId" body field. Omitted from the body when not given.',
        },
        {
          name: 'integrity-id',
          type: 'option',
          required: false,
          summary: 'Optional integer integrity level identifier from `lookup boundary integrity-levels`, sent as the "integrityId" body field. Omitted from the body when not given.',
        },
        {
          name: 'availability-id',
          type: 'option',
          required: false,
          summary: 'Optional integer availability level identifier from `lookup boundary availability-levels`, sent as the "availabilityId" body field. Omitted from the body when not given.',
        },
        {
          name: 'security-category-id',
          type: 'option',
          required: false,
          summary: 'Optional integer security category identifier, sent as the "securityCategoryId" body field. Omitted from the body when not given.',
        },
        {
          name: 'network-diagram-id',
          type: 'option',
          required: false,
          summary: 'Optional integer network diagram identifier, sent as the "networkDiagramId" body field. Omitted from the body when not given.',
        },
        {
          name: 'data-flow-diagram-id',
          type: 'option',
          required: false,
          summary: 'Optional integer data flow diagram identifier, sent as the "dataFlowDiagramId" body field. Omitted from the body when not given.',
        },
        {
          name: 'device-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer device identifier to associate. Repeat the flag to associate more than one. Each value becomes one element of the "deviceIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'location-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer location identifier to associate. Repeat the flag to associate more than one. Each value becomes one element of the "locationIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'sensitive-information-type-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer sensitive information type identifier to associate. Repeat the flag to associate more than one. Each value becomes one element of the "sensitiveInformationTypeIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'interconnection-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer interconnection identifier to associate. Repeat the flag to associate more than one. Each value becomes one element of the "interconnectionIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'law-regulation-policy-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer law, regulation, or policy identifier to associate. Repeat the flag to associate more than one. Each value becomes one element of the "lawRegulationPolicyIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'personnel-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Integer personnel identifier to associate. Repeat the flag to associate more than one. Each value becomes one element of the "personnelIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'framework-id',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Framework identifier (UUID) to associate, from `lookup icl-version frameworks`. Repeat the flag to associate more than one. Each value becomes one element of the "frameworkIds" array body field. Omitted from the body when not given.',
        },
        {
          name: 'cage-code',
          type: 'option',
          required: false,
          multiple: true,
          summary: 'Commercial and Government Entity (CAGE) code to associate. Repeat the flag to associate more than one. Each value becomes one element of the "cageCodes" array body field. Omitted from the body when not given.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'data-type get',
      summary: 'Get one data type by its integer identifier.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
          name: 'force',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'facility get',
      summary: 'Get one facility by its integer identifier.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'facility data-types get',
      summary: 'Get the data types associated with one facility.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'facility data-types set',
      summary: 'Set the data types associated with one facility, replacing the current list.',
      kind: 'api',
      permission: 'Locations: Write',
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
          name: 'data-type-id',
          type: 'option',
          required: false,
          multiple: true,
          summary:
            'Integer data type identifier to associate. Repeat the flag to associate ' +
            'more than one, for example --data-type-id 1 --data-type-id 2. Each value ' +
            'becomes one element of the "dataTypeIds" array body field. Omit the flag ' +
            'to clear every association.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'facility create',
      summary: 'Create one facility for the profile tenant.',
      kind: 'api',
      permission: 'Locations: Write',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        ...facilityWriteFlags,
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'facility update',
      summary: 'Update one facility by its integer identifier.',
      kind: 'api',
      permission: 'Locations: Write',
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
        ...facilityWriteFlags,
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'interconnection get',
      summary: 'Get one interconnection by its integer identifier.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'interconnection data-types get',
      summary: 'Get the data types associated with one interconnection.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'interconnection data-types set',
      summary: 'Set the data types associated with one interconnection, replacing the current list.',
      kind: 'api',
      permission: 'Interconnections: Write',
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
          name: 'data-type-id',
          type: 'option',
          required: false,
          multiple: true,
          summary:
            'Integer data type identifier to associate. Repeat the flag to associate ' +
            'more than one, for example --data-type-id 1 --data-type-id 2. Each value ' +
            'becomes one element of the "dataTypeIds" array body field. Omit the flag ' +
            'to clear every association.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'interconnection create',
      summary: 'Create one interconnection for the profile tenant.',
      kind: 'api',
      permission: 'Interconnections: Write',
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
          summary: 'Interconnection name, sent as the required "name" body field.',
        },
        {
          name: 'provider',
          type: 'option',
          required: false,
          summary:
            'Optional interconnection provider, sent as the "provider" body field. ' +
            'Omitted from the body when not given.',
        },
        {
          name: 'description',
          type: 'option',
          required: false,
          summary:
            'Optional interconnection description, sent as the "description" body ' +
            'field. Omitted from the body when not given.',
        },
        {
          name: 'authorizing-official-id',
          type: 'option',
          required: true,
          summary:
            'Integer personnel identifier of the authorizing official from ' +
            '`personnel list`, sent as the required "authorizingOfficialId" body field.',
        },
        {
          name: 'authorization-type',
          type: 'option',
          required: true,
          multiple: true,
          summary:
            'One authorization type to associate, written as comma-separated ' +
            'key=value pairs: id=<integer> for the required ' +
            'interconnectionAuthorizationTypeId (from ' +
            '`lookup interconnection authorization-types`), and an optional ' +
            'other=<text> for the otherValue field. Repeat the flag to associate ' +
            'more than one, for example --authorization-type id=5 ' +
            '--authorization-type id=7,other="Site-to-site VPN". Every occurrence ' +
            'becomes one element of the required "authorizationTypes" array body field.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'interconnection update',
      summary: 'Update one interconnection by its integer identifier.',
      kind: 'api',
      permission: 'Interconnections: Write',
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
          name: 'name',
          type: 'option',
          required: true,
          summary: 'Interconnection name, sent as the required "name" body field.',
        },
        {
          name: 'provider',
          type: 'option',
          required: false,
          summary:
            'Optional interconnection provider, sent as the "provider" body field. ' +
            'Omitted from the body when not given.',
        },
        {
          name: 'description',
          type: 'option',
          required: false,
          summary:
            'Optional interconnection description, sent as the "description" body ' +
            'field. Omitted from the body when not given.',
        },
        {
          name: 'authorizing-official-id',
          type: 'option',
          required: false,
          summary:
            'Integer personnel identifier of the authorizing official from ' +
            '`personnel list`, sent as the optional "authorizingOfficialId" body ' +
            'field. Omitted from the body when not given.',
        },
        {
          name: 'authorization-type',
          type: 'option',
          required: false,
          multiple: true,
          summary:
            'One authorization type to associate, written as comma-separated ' +
            'key=value pairs: id=<integer> for the required ' +
            'interconnectionAuthorizationTypeId (from ' +
            '`lookup interconnection authorization-types`), and an optional ' +
            'other=<text> for the otherValue field. Repeat the flag to associate ' +
            'more than one. Providing this flag replaces all existing authorization ' +
            'type associations. The archived contract does not state what the update ' +
            'operation does when the flag is absent, so send the full list you want ' +
            'to keep.',
        },
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'personnel get',
      summary: 'Get one person by their integer identifier.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'personnel create',
      summary: 'Create one person for the profile tenant.',
      kind: 'api',
      permission: 'Personnel: Write',
      args: [],
      flags: [
        {
          name: 'profile',
          type: 'option',
          required: true,
          summary: 'Profile that supplies the credential, tenant, and base URL.',
        },
        ...personnelWriteFlags,
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'personnel update',
      summary: 'Update one person by their integer identifier.',
      kind: 'api',
      permission: 'Personnel: Write',
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
        ...personnelWriteFlags,
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json', 'jsonl', 'table'],
          default: 'json',
          summary: 'Output format.',
        },
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
        },
      ],
    },
    {
      id: 'personnel delete',
      summary: 'Delete one person by their integer identifier, after a confirmation pause.',
      kind: 'api',
      permission: 'Personnel: Write',
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
          name: 'force',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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
        {
          name: 'json',
          type: 'boolean',
          required: false,
          summary:
            'Print JSON, the default format. Equivalent to `--output json`. ' +
            'Cannot be combined with `--output jsonl` or `--output table`.',
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

  // This suite owns every command's identity, summary, kind, permission,
  // arguments, and flags. Three catalog fields are owned elsewhere and are
  // removed before the comparison, so their expectations live in one place
  // each: `writes` in test/catalog-completeness.test.ts, `operations` in
  // test/contract.test.ts against the archived OpenAPI document, and the
  // exit-code and error tables in test/catalog-completeness.test.ts.
  const parsed = JSON.parse(result.stdout) as {
    catalogVersion: number
    exitCodes: unknown
    errors: unknown
    commands: Array<Record<string, unknown>>
  }
  assert.ok(parsed.exitCodes, 'the catalog must publish the exit codes')
  assert.ok(parsed.errors, 'the catalog must publish the error vocabulary')

  assert.deepEqual(
    {
      catalogVersion: parsed.catalogVersion,
      commands: parsed.commands.map(({writes, operations, ...command}) => command),
    },
    expectedCatalog,
  )
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

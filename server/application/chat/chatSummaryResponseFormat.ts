import {
  DURABLE_MEMORY_PROMPT_ITEM_MAX_CHARS,
  DURABLE_MEMORY_PROMPT_MAX_CONTEXT,
  DURABLE_MEMORY_PROMPT_MAX_FACTS,
  DURABLE_MEMORY_PROMPT_MAX_PREFERENCES,
  DURABLE_MEMORY_PROMPT_NAME_MAX_CHARS,
} from './durableUserMemoryPromptBudget';

type JsonSchema = Record<string, unknown>;

export type ResponsesJsonSchemaTextFormat = {
  type: 'json_schema';
  name: string;
  strict: true;
  schema: JsonSchema;
};

function createStringArraySchema(maxItems?: number, maxLength?: number) {
  return {
    type: 'array',
    ...(typeof maxItems === 'number' ? { maxItems } : {}),
    items: {
      type: 'string',
      ...(typeof maxLength === 'number' ? { maxLength } : {}),
    },
  };
}

function createNullableStringSchema(maxLength?: number) {
  return {
    anyOf: [
      {
        type: 'string',
        ...(typeof maxLength === 'number' ? { maxLength } : {}),
      },
      { type: 'null' },
    ],
  };
}

export const runtimeCompactStateResponseFormat: ResponsesJsonSchemaTextFormat =
  {
    type: 'json_schema',
    name: 'runtime_compact_state',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        schemaVersion: { type: 'integer', enum: [1] },
        compactOverview: { type: 'string', maxLength: 600 },
        activeThemes: createStringArraySchema(8, 120),
        activePatterns: createStringArraySchema(8, 180),
        helpfulInterventions: createStringArraySchema(8, 220),
        unfinishedThreads: createStringArraySchema(8, 220),
        riskState: {
          type: 'string',
          enum: ['none', 'watch', 'elevated'],
        },
        nextTurnGuidance: createStringArraySchema(6, 220),
      },
      required: [
        'schemaVersion',
        'compactOverview',
        'activeThemes',
        'activePatterns',
        'helpfulInterventions',
        'unfinishedThreads',
        'riskState',
        'nextTurnGuidance',
      ],
    },
  };

export const handoffSummaryResponseFormat: ResponsesJsonSchemaTextFormat = {
  type: 'json_schema',
  name: 'session_handoff_summary',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      schemaVersion: { type: 'integer', enum: [1] },
      sessionOverviewShort: { type: 'string', maxLength: 700 },
      themesActive: createStringArraySchema(8, 120),
      patternsOrTriggers: createStringArraySchema(8, 180),
      helpfulInterventions: createStringArraySchema(8, 220),
      unfinishedThreads: createStringArraySchema(8, 220),
      riskState: {
        type: 'string',
        enum: ['none', 'watch', 'elevated'],
      },
      nextSessionGuidance: createStringArraySchema(6, 220),
    },
    required: [
      'schemaVersion',
      'sessionOverviewShort',
      'themesActive',
      'patternsOrTriggers',
      'helpfulInterventions',
      'unfinishedThreads',
      'riskState',
      'nextSessionGuidance',
    ],
  },
};

export const sessionEndMemoryBundleResponseFormat: ResponsesJsonSchemaTextFormat =
  {
    type: 'json_schema',
    name: 'session_end_memory_bundle',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        handoff: {
          ...handoffSummaryResponseFormat.schema,
        },
        profile: {
          type: 'object',
          additionalProperties: false,
          properties: {
            schemaVersion: { type: 'integer', enum: [1] },
            name: {
              ...createNullableStringSchema(
                DURABLE_MEMORY_PROMPT_NAME_MAX_CHARS
              ),
            },
            facts: createStringArraySchema(
              DURABLE_MEMORY_PROMPT_MAX_FACTS,
              DURABLE_MEMORY_PROMPT_ITEM_MAX_CHARS
            ),
            preferences: createStringArraySchema(
              DURABLE_MEMORY_PROMPT_MAX_PREFERENCES,
              DURABLE_MEMORY_PROMPT_ITEM_MAX_CHARS
            ),
            context: createStringArraySchema(
              DURABLE_MEMORY_PROMPT_MAX_CONTEXT,
              DURABLE_MEMORY_PROMPT_ITEM_MAX_CHARS
            ),
          },
          required: [
            'schemaVersion',
            'name',
            'facts',
            'preferences',
            'context',
          ],
        },
      },
      required: ['handoff', 'profile'],
    },
  };

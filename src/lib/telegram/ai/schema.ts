import { z } from "zod";

const createGroupSchema = z.object({
  date_reference: z.string(),
  project_reference: z.string(),
  entries: z.array(z.object({
    employee_reference: z.string(),
    regular_hours: z.number().nullable(),
    overtime_hours: z.number().nullable(),
    notes: z.string().nullable(),
  })),
});

const reportSchema = z.object({
  employee_reference: z.string().nullable(),
  project_reference: z.string().nullable(),
  date_reference: z.string().nullable(),
  date_from_reference: z.string().nullable(),
  date_to_reference: z.string().nullable(),
});

export const parsedIntentSchema = z.object({
  intent: z.enum(["CREATE_TIME_ENTRIES", "REPORT_QUERY", "UNKNOWN"]),
  create_groups: z.array(createGroupSchema),
  report: reportSchema.nullable(),
  missing_information: z.array(z.string()),
});

export type ParsedIntent = z.infer<typeof parsedIntentSchema>;

export const parsedIntentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "create_groups", "report", "missing_information"],
  properties: {
    intent: { type: "string", enum: ["CREATE_TIME_ENTRIES", "REPORT_QUERY", "UNKNOWN"] },
    create_groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date_reference", "project_reference", "entries"],
        properties: {
          date_reference: { type: "string" },
          project_reference: { type: "string" },
          entries: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["employee_reference", "regular_hours", "overtime_hours", "notes"],
              properties: {
                employee_reference: { type: "string" },
                regular_hours: { type: ["number", "null"] },
                overtime_hours: { type: ["number", "null"] },
                notes: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
    report: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["employee_reference", "project_reference", "date_reference", "date_from_reference", "date_to_reference"],
          properties: {
            employee_reference: { type: ["string", "null"] },
            project_reference: { type: ["string", "null"] },
            date_reference: { type: ["string", "null"] },
            date_from_reference: { type: ["string", "null"] },
            date_to_reference: { type: ["string", "null"] },
          },
        },
      ],
    },
    missing_information: { type: "array", items: { type: "string" } },
  },
} as const;

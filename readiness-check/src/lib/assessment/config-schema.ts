import { z } from "zod";

const optionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  score: z.number().int().min(0).max(3).optional(),
  offerRow: z.string().min(1).optional(),
});

const questionSchema = z.object({
  id: z.string().min(1),
  sectionId: z.enum(["pressure", "readiness", "growth", "about"]),
  type: z.enum(["multi_select", "single_select", "text", "url"]),
  prompt: z.string().min(1),
  dim: z.enum(["data", "process", "people", "decision"]).optional(),
  maxLength: z.number().int().positive().optional(),
  suggestions: z.array(z.string()).optional(),
  options: z.array(optionSchema).optional(),
});

const suggestionSchema = z.object({
  code: z.string().min(1),
  section: z.enum(["readiness", "growth", "visibility"]),
  severity: z.enum(["info", "warn", "critical"]),
  title: z.string().min(1),
  body: z.string().min(1),
  guideSlug: z.string().regex(/^[a-z0-9]+(?:\/[a-z0-9-]+)?$/),
});

export const assessmentConfigSchema = z
  .object({
    meta: z.object({
      name: z.string().min(1),
      version: z.literal("v1"),
    }),
    gate: z.object({ mode: z.literal("before_results") }),
    weights: z.object({
      readiness: z.number(),
      visibility: z.number(),
      growth: z.number(),
      fallbackWithoutVisibility: z.object({
        readiness: z.number(),
        growth: z.number(),
      }),
    }),
    bands: z.array(
      z.object({
        id: z.enum(["early", "forming", "ready", "running"]),
        min: z.number().int(),
        max: z.number().int(),
        label: z.string(),
        sentence: z.string(),
      }),
    ),
    severity: z.array(z.object({ score: z.union([z.literal(1), z.literal(2), z.literal(3)]), label: z.string() })),
    questions: z.array(questionSchema),
    suggestions: z.array(suggestionSchema),
    offers: z.array(
      z.object({
        row: z.string(),
        said: z.string(),
        build: z.string(),
        specimens: z.array(z.object({ name: z.string(), url: z.string().url() })),
      }),
    ),
    copy: z.record(z.string(), z.string()),
  })
  .superRefine((config, ctx) => {
    const ids = config.questions.map((q) => q.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["questions"], message: "question ids must be unique" });
    }
    const offerRows = new Set(config.offers.map((o) => o.row));
    for (const q of config.questions) {
      for (const opt of q.options ?? []) {
        if (opt.offerRow && !offerRows.has(opt.offerRow)) {
          ctx.addIssue({
            code: "custom",
            path: ["questions", q.id, opt.value],
            message: `unknown offerRow ${opt.offerRow}`,
          });
        }
      }
    }
    const slugs = config.suggestions.map((s) => s.guideSlug);
    if (new Set(slugs).size !== slugs.length) {
      ctx.addIssue({ code: "custom", path: ["suggestions"], message: "guideSlug must be unique" });
    }
    const bands = [...config.bands].sort((a, b) => a.min - b.min);
    if (bands[0]?.min !== 0 || bands[bands.length - 1]?.max !== 100) {
      ctx.addIssue({ code: "custom", path: ["bands"], message: "bands must cover 0–100" });
    }
    for (let i = 1; i < bands.length; i++) {
      if (bands[i].min !== bands[i - 1].max + 1) {
        ctx.addIssue({ code: "custom", path: ["bands"], message: "band ranges must be contiguous" });
      }
    }
  });

export type AssessmentConfig = z.infer<typeof assessmentConfigSchema>;

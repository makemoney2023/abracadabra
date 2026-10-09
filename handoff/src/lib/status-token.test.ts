import { describe, expect, it } from "vitest";
import { DEAL_STAGES, DEAL_STAGE_LABEL } from "@/db/crm";
import {
  DELIVERABLE_STATUS_LABEL,
} from "@/app/deliverables/labels";
import {
  HEALTH_LABEL,
  PROJECT_STATUS_LABEL,
  TASK_STATUS_LABEL,
} from "@/app/projects/labels";
import { STATUS_TONES, statusToken } from "./status-token";

describe("statusToken", () => {
  it("covers every task status with a tone and its label", () => {
    for (const [value, label] of Object.entries(TASK_STATUS_LABEL)) {
      const token = statusToken("task", value);
      expect(STATUS_TONES).toContain(token.tone);
      expect(token.label).toBe(label);
    }
    expect(statusToken("task", "late")).toEqual({ tone: "late", label: "Late" });
    expect(statusToken("task", "blocked").tone).toBe("blocked");
    expect(statusToken("task", "done").tone).toBe("complete");
    expect(statusToken("task", "doing").tone).toBe("active");
    expect(statusToken("task", "todo").tone).toBe("neutral");
  });

  it("covers every project status", () => {
    for (const [value, label] of Object.entries(PROJECT_STATUS_LABEL)) {
      const token = statusToken("project", value);
      expect(STATUS_TONES).toContain(token.tone);
      expect(token.label).toBe(label);
    }
    expect(statusToken("project", "waiting_on_client").tone).toBe("waiting");
    expect(statusToken("project", "active").tone).toBe("active");
    expect(statusToken("project", "done").tone).toBe("complete");
  });

  it("covers every health value", () => {
    for (const [value, label] of Object.entries(HEALTH_LABEL)) {
      const token = statusToken("health", value);
      expect(STATUS_TONES).toContain(token.tone);
      expect(token.label).toBe(label);
    }
    expect(statusToken("health", "off_track").tone).toBe("late");
    expect(statusToken("health", "at_risk").tone).toBe("waiting");
    expect(statusToken("health", "on_track").tone).toBe("active");
  });

  it("covers every deliverable status", () => {
    for (const [value, label] of Object.entries(DELIVERABLE_STATUS_LABEL)) {
      const token = statusToken("deliverable", value);
      expect(STATUS_TONES).toContain(token.tone);
      expect(token.label).toBe(label);
    }
    expect(statusToken("deliverable", "changes_requested").tone).toBe("blocked");
    expect(statusToken("deliverable", "in_review").tone).toBe("waiting");
    expect(statusToken("deliverable", "approved").tone).toBe("complete");
  });

  it("covers every deal stage", () => {
    for (const stage of DEAL_STAGES) {
      const token = statusToken("deal", stage);
      expect(STATUS_TONES).toContain(token.tone);
      expect(token.label).toBe(DEAL_STAGE_LABEL[stage]);
    }
    expect(statusToken("deal", "won").tone).toBe("complete");
    expect(statusToken("deal", "lost").tone).toBe("neutral");
  });

  it("maps schema and github values", () => {
    expect(statusToken("schema", "pass")).toEqual({ tone: "active", label: "Pass" });
    expect(statusToken("schema", "fail")).toEqual({ tone: "late", label: "Fail" });
    expect(statusToken("github", "connected")).toEqual({ tone: "active", label: "Connected" });
    expect(statusToken("github", "disconnected")).toEqual({
      tone: "neutral",
      label: "Not connected",
    });
  });

  it("maps lead values", () => {
    expect(statusToken("lead", "open").tone).toBe("active");
    expect(statusToken("lead", "won").tone).toBe("complete");
  });

  it("falls back to neutral with the raw value as the label", () => {
    expect(statusToken("task", "mystery")).toEqual({ tone: "neutral", label: "mystery" });
    expect(statusToken("deal", "")).toEqual({ tone: "neutral", label: "" });
  });
});

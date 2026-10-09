import { describe, expect, it } from "vitest";
import { OPENING_PACK_ID } from "./pack-templates";
import { choosePackId, packsFromTemplates, packIdFromModel, pickSkillPack, pickTaskPack } from "./pack-picker";

const packs = [
  { id: "pack-sales", name: "Sales", description: "Skills: call prep, account research." },
  { id: "pack-seo", name: "Seo", description: "Skills: seo audit, search intent." },
];

describe("skill pack picker", () => {
  it("picks the pack whose skills match the lead", () => {
    expect(pickSkillPack({ name: "Foam", notes: "Need an seo audit before we buy ads." }, packs)).toEqual({
      id: "pack-seo",
      name: "Seo",
    });
  });

  it("keeps schema readiness when the lead has no matching work", () => {
    expect(pickSkillPack({ name: "Ada" }, packs)).toEqual({ id: OPENING_PACK_ID, name: "Schema readiness" });
    expect(pickSkillPack({ name: "Ada", notes: "" }, [])).toEqual({ id: OPENING_PACK_ID, name: "Schema readiness" });
  });

  it("picks one pack for a task and leaves a task with no overlap unmatched", () => {
    expect(pickTaskPack("Write a social media content calendar", packs)).toBeNull();
    expect(pickTaskPack("Run an seo audit of the site", packs)).toEqual({ id: "pack-seo", name: "Seo" });
    expect(
      pickTaskPack("Read the schema", [
        ...packs,
        { id: OPENING_PACK_ID, name: "Schema readiness", description: "Schema scan." },
      ]),
    ).toEqual({ id: OPENING_PACK_ID, name: "Schema readiness" });
    expect(pickTaskPack("Hello", [{ id: OPENING_PACK_ID, name: "Schema readiness", description: "Schema." }])).toBeNull();
  });

  it("drops a model id that is not a live pack and keeps the overlap", () => {
    expect(packIdFromModel("pack-seo", packs)).toBe("pack-seo");
    expect(packIdFromModel('{"id":"pack-sales"}', packs)).toBe("pack-sales");
    expect(packIdFromModel("pack-missing", packs)).toBeNull();
    expect(choosePackId("pack-missing", "Need an seo audit", packs)).toBe("pack-seo");
    expect(choosePackId("none", "Hello there", packs)).toBeNull();
  });

  it("keeps only pack templates from the swarm list", () => {
    expect(
      packsFromTemplates([
        { id: "pipeline-intake", name: "Intake" },
        { id: "pack-seo", name: "Seo", description: "Search." },
      ]),
    ).toEqual([{ id: "pack-seo", name: "Seo", description: "Search." }]);
    expect(packsFromTemplates({ templates: [] })).toEqual([]);
  });
});

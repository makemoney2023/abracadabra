import { describe, expect, it } from "vitest";
import { OPENING_PACK_ID } from "./pack-templates";
import { packsFromTemplates, pickSkillPack } from "./pack-picker";

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

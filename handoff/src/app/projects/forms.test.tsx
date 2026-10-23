import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => {
  const action = async () => ({ message: "" });
  return {
    createMilestoneAction: action,
    createProjectAction: action,
    createProjectTaskAction: action,
    postStatusAction: action,
    publishStatusAction: action,
    saveProjectDescriptionAction: action,
    setProjectLibraryAction: action,
    updateProjectAction: action,
    updateTaskStatusAction: action,
  };
});

import { ProjectForm, ProjectLibraryForm } from "./forms";

describe("project Library option", () => {
  it("the add-a-project form offers the Library option, on by default", () => {
    const html = renderToStaticMarkup(<ProjectForm organizationId="org-1" />);
    expect(html).toContain("Show finished work in the Library");
    expect(html).toContain('name="libraryOption"');
    expect(html).toContain('name="includeInLibrary"');
    expect(html).toMatch(/role="checkbox"[^>]*aria-checked="true"/);
    expect(html).toContain("social pipeline");
  });

  it("the edit form shows an opted-out project unchecked", () => {
    const off = renderToStaticMarkup(<ProjectLibraryForm projectId="p-1" organizationId="org-1" includeInLibrary={false} />);
    expect(off).toMatch(/role="checkbox"[^>]*aria-checked="false"/);
    expect(off).toContain('name="projectId"');
    const on = renderToStaticMarkup(<ProjectLibraryForm projectId="p-1" organizationId="org-1" includeInLibrary />);
    expect(on).toMatch(/role="checkbox"[^>]*aria-checked="true"/);
  });
});

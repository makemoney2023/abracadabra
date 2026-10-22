import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LibraryBrowser } from "./library-browser";

describe("library browser", () => {
  it("keeps every discovery control in the URL form, including project", () => {
    const html = renderToStaticMarkup(
      <LibraryBrowser
        slug="acme"
        page={{
          artifacts: [],
          nextCursor: null,
          counts: {
            total: 0,
            article: 0,
            social: 0,
            video: 0,
            image: 0,
            website: 0,
            document: 0,
            file: 0,
          },
        }}
        query={{ project: "project-1" }}
        projects={[
          { id: "project-1", name: "Q4 launch" },
          { id: "project-2", name: "Website refresh" },
        ]}
      />,
    );

    expect(html).toContain("Library types");
    expect(html).toContain("Articles");
    expect(html).toContain("Sources");
    expect(html).toContain('name="project"');
    expect(html).toContain("Q4 launch");
    expect(html).toContain("Website refresh");
    expect(html).toContain('value="project-1" selected');
    expect(html).toContain("Search and filters");
  });
});

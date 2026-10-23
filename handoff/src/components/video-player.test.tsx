import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicLibraryView } from "./library/public-library-view";
import { VideoPlayer } from "./video-player";

describe("video player", () => {
  it("is a native player that plays inline on iPhones and loads only the start", () => {
    const html = renderToStaticMarkup(<VideoPlayer src="/api/files/f-1/preview" poster="/api/files/f-2/preview" title="schema-video.mp4" name="Social/schema-video.mp4" />);
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain("playsInline");
    expect(html).toContain('preload="metadata"');
    expect(html).toContain('poster="/api/files/f-2/preview"');
    expect(html).toContain('<source src="/api/files/f-1/preview" type="video/mp4"');
    expect(html).toContain('aria-label="schema-video.mp4"');
  });

  it("asks for the first frame when there is no poster", () => {
    const html = renderToStaticMarkup(<VideoPlayer src="/clip" title="Clip" type="video/webm" />);
    expect(html).toContain('<source src="/clip#t=0.1" type="video/webm"');
    expect(html).not.toContain("poster=");
  });

  it("plays a shared clip on a read-only view link through the share's own video address", () => {
    const html = renderToStaticMarkup(
      <PublicLibraryView
        token="tok 1"
        result={{ ok: true, view: { title: "Q4", downloads: false, items: [{ publicId: "pub-1", title: "schema-video.mp4", externalUrl: null, hasPicture: true, hasVideo: true }] } }}
      />,
    );
    expect(html).toContain('src="/view/tok%201/video/pub-1');
    expect(html).toContain('poster="/view/tok%201/media/pub-1"');
    expect(html).not.toContain("<img");
    expect(html).toContain("playsInline");
  });
});

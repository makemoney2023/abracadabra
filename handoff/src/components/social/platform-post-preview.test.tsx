import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformPostPreview } from "./platform-post-preview-view";
import { platformPostFrames, previewPlatforms } from "./platform-post-preview";

const slides = [
  { src: "/one.jpg", alt: "First", video: false },
  { src: "/two.jpg", alt: "Second", video: false },
  { src: "/three.jpg", alt: "Third", video: false },
];

describe("in-situ post frames", () => {
  it("makes Facebook and Instagram look like different posts", () => {
    const frames = platformPostFrames({
      postType: "feed",
      caption: "The launch line",
      slides: 1,
      platforms: ["facebook", "instagram"],
      captions: { instagram: "The Instagram line" },
    });
    expect(frames.map((frame) => frame.chrome)).toEqual(["facebook", "instagram"]);
    expect(frames[0]).toMatchObject({ captionPlace: "above", actions: ["Like", "Comment", "Share"], caption: "The launch line" });
    expect(frames[1]).toMatchObject({ captionPlace: "below", caption: "The Instagram line", actions: expect.arrayContaining(["Save"]) });
    expect(JSON.stringify(frames)).not.toContain("Zernio");
  });

  it("keeps a carousel as one set of slides even before a network is chosen", () => {
    const frames = platformPostFrames({ postType: "carousel", caption: "Swipe", slides: 3 });
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ chrome: "carousel", layout: "carousel", slides: 3, network: "Carousel" });
  });

  it("uses a tall frame for a Reel and prefers real destinations over draft networks", () => {
    expect(platformPostFrames({ postType: "reel", caption: "Watch", slides: 1, platforms: ["instagram"] })[0]).toMatchObject({
      chrome: "instagram",
      layout: "reel",
      tall: true,
      captionPlace: "overlay",
    });
    expect(previewPlatforms({ channel: "facebook", textPlatforms: ["instagram"], targetPlatforms: ["linkedin"] })).toEqual(["linkedin"]);
  });

  it("renders a Facebook carousel with one slide, dots, and next", () => {
    const html = renderToStaticMarkup(
      createElement(PlatformPostPreview, {
        accountName: "Acme",
        frames: platformPostFrames({ postType: "carousel", caption: "Three looks", slides: 3, platforms: ["facebook"] }),
        media: slides,
      }),
    );
    expect(html).toContain('data-chrome="facebook"');
    expect(html).toContain('data-layout="carousel"');
    expect(html).toContain("1 / 3");
    expect(html).toContain("Next slide");
    expect(html).toContain("Previous slide");
    expect(html).toContain("Three looks");
    expect(html).not.toContain("/two.jpg");
    expect(html.match(/data-dot=/g)).toHaveLength(3);
  });
});

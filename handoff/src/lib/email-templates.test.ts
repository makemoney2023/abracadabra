import { describe, expect, it } from "vitest";
import { STUDIO } from "./brand/studio";
import { renderInviteEmail } from "./email-templates";

const URL = "https://handoff.example/auth/callback?token=abc&next=%2Finvites%2F11111111-1111-4111-8111-111111111111";

describe("renderInviteEmail", () => {
  it("builds a dark invite with one button and a plain copy", () => {
    const mail = renderInviteEmail({
      from: "magic@abra-ca-dabra.app",
      to: "guest@example.com",
      spaceName: "Northwind Co",
      url: URL,
    });

    expect(mail.subject).toBe("You're invited to Northwind Co");
    expect(mail.text).toContain("Northwind Co");
    expect(mail.text).toContain(URL);
    expect(mail.text).toContain("press the button");
    expect(mail.text).not.toContain("15 minutes");
    expect(mail.text).not.toContain("stops working");
    if (!mail.html) throw new Error("invite html is missing");
    expect(mail.html).toContain("HANDOFF");
    expect(mail.html).toContain("You're invited");
    expect(mail.html).toContain("Open your invite");
    expect(mail.html).toContain(`href="${URL.replaceAll("&", "&amp;")}"`);
    expect(mail.html.match(/href="/g)).toHaveLength(1);
    expect(mail.html).toContain(STUDIO.canvas);
    expect(mail.html).toContain(STUDIO.surface);
    expect(mail.html).toContain(STUDIO.ink);
    expect(mail.html).toContain(STUDIO.accent);
    expect(mail.html).toContain(STUDIO.accentInk);
    expect(mail.html).toContain("Tektur");
    expect(mail.html).toContain("IBM Plex Sans");
    expect(mail.html).toContain(`background:${STUDIO.accent}`);
    expect(mail.html).not.toContain("15 minutes");
    expect(mail.html).not.toContain("stops working");
    expect(mail.html).not.toContain("token_hash");
  });

  it("escapes the space name and falls back when the name is blank", () => {
    const named = renderInviteEmail({
      from: "magic@abra-ca-dabra.app",
      to: "guest@example.com",
      spaceName: `North <wind> & "Co"`,
      url: URL,
    });
    if (!named.html) throw new Error("invite html is missing");
    expect(named.html).toContain("North &lt;wind&gt; &amp; &quot;Co&quot;");
    expect(named.html).not.toContain("<wind>");
    expect(named.subject).toBe(`You're invited to North <wind> & "Co"`);

    const blank = renderInviteEmail({
      from: "magic@abra-ca-dabra.app",
      to: "guest@example.com",
      spaceName: "   ",
      url: URL,
    });
    expect(blank.subject).toBe("You're invited to Handoff");
    expect(blank.text).toContain("Handoff");
    if (!blank.html) throw new Error("invite html is missing");
    expect(blank.html).toContain("Handoff has a private folder ready for you.");
  });
});

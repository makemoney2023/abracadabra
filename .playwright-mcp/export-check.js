async (page) => {
  const token = (await (await fetch("http://127.0.0.1:8765/staff")).text()).trim();
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "handoff_session",
      value: token,
      url: "http://localhost:3000/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(
    "http://localhost:3000/w/northwind/batches/ede33787-4ec3-411f-9368-2c26ac038029",
    { waitUntil: "networkidle" },
  );
  const heading = await page.locator("h1").textContent();
  const button = page.getByRole("button", { name: "Export batch" });
  const visible = await button.isVisible();
  const responsePromise = page.waitForResponse((response) => response.url().includes("/export"));
  await button.click();
  const response = await responsePromise;
  const json = await response.json();
  const file = json.files?.[0] ?? {};
  const status = await page.getByRole("status").textContent();
  return {
    heading,
    visible,
    http: response.status,
    slug: json.slug,
    batchId: json.batchId,
    label: json.label,
    fileCount: Array.isArray(json.files) ? json.files.length : 0,
    relativePath: file.relativePath,
    statusName: file.status,
    hasUrl: typeof file.url === "string" && file.url.includes("/api/files/") && file.url.includes("exp="),
    leakedSigInPage: (await page.content()).includes("sig="),
    status,
  };
}

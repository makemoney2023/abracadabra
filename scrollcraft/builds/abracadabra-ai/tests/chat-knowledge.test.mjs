// The website chat (and its voice call) answers only from workers/abracadabra-chat/src/site-knowledge.js, which is
// generated from this folder: site-data.mjs, service-sales.mjs, super-funnel-case.mjs, sitemap.xml and the built pages.
// When a page, product or case study changes here, regenerate it in the same PR:
//   cd workers/abracadabra-chat && npm run knowledge
// then deploy abracadabra-chat (before this Worker). `npm run deploy` here runs the same check first.
import test from "node:test";
import assert from "node:assert/strict";
import { buildKnowledge } from "../../../../workers/abracadabra-chat/scripts/build-site-knowledge.mjs";
import { SITE_KNOWLEDGE, SITE_PATHS } from "../../../../workers/abracadabra-chat/src/site-knowledge.js";

test("the chat's site knowledge matches this site (run npm run knowledge in workers/abracadabra-chat)", async () => {
  const { text, paths } = await buildKnowledge();
  assert.equal(SITE_KNOWLEDGE, text);
  assert.deepEqual(SITE_PATHS, paths);
});

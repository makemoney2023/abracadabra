---
name: muapi-render
description: >
  Run one MuAPI render role, then poll. Roles are still, animate, edit, upscale,
  cutout, sound, lipsync, clip, and poll. Use when a swarm node must generate or
  edit one image, video, or audio asset through the MuAPI tools on the portal.
---

# MuAPI render

One node. One role. One submit. Then poll.

The node's instructions contain a line `Role: <name>`. Follow that section only. Ignore the other sections.

## Every role

- Call only the tools listed for this node. Use the server id printed beside each tool. On an HQ run that id is the portal.
- Emit a tool call in the exact block the prompt shows.
- An image, video, or audio input is a URL already in the brief or in an upstream output. Do not embed file bytes.
- Submit once. Then call `muapi_predict_result` with the returned `request_id`, unless the role is `poll`.
- Stop when `status` is `completed` or when no further tool call is available.
- The final answer quotes `request_id`, `status`, and any output URL from the last observation.
- A status other than `completed` is the deliverable. Do not describe media the observation did not return.

## Role: still

One still.

- When the brief or an upstream output already has an image URL, call `muapi_image_edit` with that URL and the approved prompt.
- Otherwise call `search_models` for a text-to-image model, then `muapi_image_generate` once.
- Poll.

## Role: animate

One clip.

- If the node instructions say to skip a storyboard frame that was not picked, and this frame is not in the approved pick list, return `skipped` and do not call a tool.
- When a still URL is in hand, call `muapi_video_from_image` with that URL and the approved motion prompt.
- Otherwise call `muapi_video_generate` once from the text prompt.
- Poll.

## Role: edit

One change to one URL.

- Call `muapi_image_edit` on the URL the instructions name. Use the aspect ratio or change written in the node instructions.
- Poll.

## Role: upscale

- Call `muapi_enhance_upscale` on the still URL.
- Poll.

## Role: cutout

- Call `muapi_enhance_bg_remove` on the still URL.
- Poll.

## Role: sound

One track.

- For music, call `muapi_audio_create`.
- For an effect or ambience, call `muapi_audio_from_text`.
- Poll.

## Role: lipsync

- If the node instructions say to skip when the brief has no audio URL, and no audio URL is present, return `skipped` and do not call a tool.
- Otherwise call `muapi_edit_lipsync` with the video URL and the audio URL.
- Poll.

## Role: clip

- Call `muapi_edit_clipping` with the long video URL.
- Poll.

## Role: poll

- Call `muapi_predict_result` with the request id in the brief.
- Return the CDN URL when `status` is `completed`. Otherwise return the same id and the latest status.

// Written by scripts/build-fillers.mjs (npm run fillers). Do not edit by hand.
// Which /assets/voice/filler-<n>.mp3 files hold the current FILLERS text (voice.js), and which other
// voices have their own set in /assets/voice/<speaker>/. The call only plays built lines in its own voice,
// so a new filler line is silent until its audio is built. version is the widget's cache key.
export const FILLER_AUDIO = {
  "version": "7",
  "speaker": "luna",
  "texts": ["Let me check.", "One sec.", "Let me see.", "Just a moment.", "Okay, one moment.", "Let me look.", "Bear with me a second.", "Hmm, let me think.", "Okay, checking.", "Give me a second."],
  "voices": {
    "thalia": { "texts": ["Let me check.", "One sec.", "Let me see.", "Just a moment.", "Okay, one moment.", "Let me look.", "Bear with me a second.", "Hmm, let me think.", "Okay, checking.", "Give me a second."] },
    "andromeda": { "texts": ["Let me check.", "One sec.", "Let me see.", "Just a moment.", "Okay, one moment.", "Let me look.", "Bear with me a second.", "Hmm, let me think.", "Okay, checking.", "Give me a second."] },
  },
};

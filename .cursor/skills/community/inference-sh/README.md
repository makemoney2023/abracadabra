# inference.sh Skills

AI agent skills for models via [inference.sh](https://inference.sh) CLI — generate images, videos, audio, call LLMs, search the web, and more.

**Source:** https://github.com/inference-sh/skills  
**Publisher:** [inference.sh](https://inference.sh)  
**License:** MIT  
**Skills:** 85

Requires the [belt CLI](https://inference.sh/docs/extend/cli-setup) for tool skills. See [cli-install.md](./cli-install.md) for setup.

## Quick Start

```bash
# Copy a single skill
cp -r skills/community/inference-sh/ai-podcast-creation /path/to/project/.cursor/skills/

# Copy podcast production stack (script → TTS → music → merge)
cp -r skills/community/inference-sh/{ai-podcast-creation,text-to-speech,ai-music-generation,llm-models,infsh-cli} /path/to/project/.cursor/skills/
```

Install belt CLI globally:

```bash
npx skills add belt-sh/cli
belt login
```

## Skills by Category

### Audio & Speech (13)

| Skill | Purpose |
|-------|---------|
| `text-to-speech` | Kokoro, DIA, Chatterbox TTS |
| `speech-to-text` | Audio transcription |
| `elevenlabs-tts` | ElevenLabs text-to-speech |
| `elevenlabs-stt` | ElevenLabs speech-to-text |
| `elevenlabs-dialogue` | Multi-speaker dialogue |
| `dialogue-audio` | Conversational audio generation |
| `elevenlabs-voice-changer` | Voice transformation |
| `elevenlabs-voice-isolator` | Voice isolation |
| `ai-voice-cloning` | Voice cloning |
| `elevenlabs-music` | ElevenLabs music generation |
| `elevenlabs-sound-effects` | Sound effects |
| `elevenlabs-dubbing` | Audio dubbing |
| `ai-music-generation` | AI music via inference.sh |

### Podcasts (2)

| Skill | Purpose |
|-------|---------|
| `ai-podcast-creation` | Full podcast pipeline — TTS, music, multi-voice, episodes |
| `ai-podcast` | NotebookLM-style podcast discussions from documents |

### Image Generation (10)

| Skill | Purpose |
|-------|---------|
| `ai-image-generation` | 50+ image models (FLUX, Gemini, Reve, etc.) |
| `gpt-image` | GPT image generation |
| `flux-image` | FLUX image models |
| `p-image` | P-Image models |
| `qwen-image-2` | Qwen Image 2 |
| `qwen-image-2-pro` | Qwen Image 2 Pro |
| `nano-banana` | Nano Banana image model |
| `nano-banana-2` | Nano Banana 2 |
| `image-upscaling` | Image upscaling |
| `background-removal` | Background removal |

### Video Generation (9)

| Skill | Purpose |
|-------|---------|
| `ai-video-generation` | 40+ video models (Veo, Seedance, Wan, etc.) |
| `seedance` | Seedance video |
| `google-veo` | Google Veo |
| `p-video` | P-Video generation |
| `image-to-video` | Image-to-video conversion |
| `ai-avatar-video` | AI avatar videos |
| `p-video-avatar` | P-Video avatar |
| `happyhorse` | HappyHorse video |
| `remotion-render` | Remotion render pipeline |

### LLM & Search (3)

| Skill | Purpose |
|-------|---------|
| `llm-models` | Claude, Gemini, Kimi, GLM via inference.sh |
| `ai-rag-pipeline` | RAG pipelines |
| `web-search` | Tavily, Exa search |

### Platform & SDK (8)

| Skill | Purpose |
|-------|---------|
| `infsh-cli` | inference.sh CLI (`belt`) reference |
| `building-apps` | Build apps on inference.sh |
| `python-sdk` | Python SDK with async, streaming |
| `javascript-sdk` | JS/TS SDK with streaming, tools, React |
| `agent-tools` | Agent tool integration |
| `agent-browser` | Browser automation |
| `python-executor` | Python code execution |
| `related-skill` | Related skill discovery |

### UI Components (4)

| Skill | Purpose |
|-------|---------|
| `agent-ui` | Full agent interface |
| `chat-ui` | Chat components |
| `tools-ui` | Tool call/result rendering |
| `widgets-ui` | Embeddable widgets |

### Design Guides (12)

| Skill | Purpose |
|-------|---------|
| `logo-design-guide` | Logo design with AI |
| `landing-page-design` | Landing page visuals |
| `og-image-design` | Open Graph images |
| `youtube-thumbnail-design` | YouTube thumbnails |
| `app-store-screenshots` | App store screenshots |
| `pitch-deck-visuals` | Pitch deck design |
| `book-cover-design` | Book covers |
| `character-design-sheet` | Character design sheets |
| `email-design` | Email visuals |
| `data-visualization` | Data viz design |
| `ai-product-photography` | AI product photos |
| `product-photography` | Product photography |

### Content & Writing (7)

| Skill | Purpose |
|-------|---------|
| `technical-blog-writing` | Technical blog posts |
| `seo-content-brief` | SEO content briefs |
| `case-study-writing` | Case studies |
| `press-release-writing` | Press releases |
| `newsletter-curation` | Newsletter curation |
| `ai-content-pipeline` | End-to-end content pipelines |
| `content-repurposing` | Repurpose content across formats |
| `ai-automation-workflows` | AI automation workflows |

### Social Media (5)

| Skill | Purpose |
|-------|---------|
| `twitter-automation` | X/Twitter API automation |
| `ai-social-media-content` | Social media content |
| `twitter-thread-creation` | Twitter threads |
| `linkedin-content` | LinkedIn posts |
| `social-media-carousel` | Carousel posts |

### Video Production (5)

| Skill | Purpose |
|-------|---------|
| `ai-marketing-videos` | Marketing video production |
| `explainer-video-guide` | Explainer videos |
| `storyboard-creation` | Storyboards |
| `talking-head-production` | Talking head videos |
| `video-ad-specs` | Video ad specifications |

### Product & Strategy (4)

| Skill | Purpose |
|-------|---------|
| `product-hunt-launch` | Product Hunt launches |
| `product-changelog` | Product changelogs |
| `customer-persona` | Customer personas |
| `competitor-teardown` | Competitor analysis |

### Prompting (2)

| Skill | Purpose |
|-------|---------|
| `prompt-engineering` | Prompt engineering |
| `video-prompting-guide` | Video prompt writing |

## Podcast Workflow

The `ai-podcast-creation` skill orchestrates these related skills:

1. `llm-models` — write the script
2. `text-to-speech` — generate voice segments (Kokoro, DIA, Chatterbox)
3. `ai-music-generation` — intro/outro/background music
4. `infsh-cli` — `belt app run` and `media-merger` commands

## License

MIT — see [upstream LICENSE](https://github.com/inference-sh/skills).

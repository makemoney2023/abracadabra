import { RECIPES, type SoundName, type SoundRecipe } from "./recipes";
import { renderRecipeOffline, sourceEnd, shimmerTail } from "./engine";
import { audioBufferToWavBlob } from "./wav-encoder";

const CLEANUP_MARGIN = 0.05;

function soundLength(recipe: SoundRecipe): number {
  return sourceEnd(recipe) + shimmerTail(recipe.shimmer) + CLEANUP_MARGIN;
}

export async function renderSoundToBuffer(
  sound: SoundName,
  sampleRate = 44100,
): Promise<AudioBuffer> {
  const recipe = RECIPES[sound];
  const duration = soundLength(recipe);
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  renderRecipeOffline(offlineCtx, recipe);
  return offlineCtx.startRendering();
}

const fileCache = new Map<SoundName, File>();

export async function renderSoundToFile(sound: SoundName): Promise<File> {
  const cached = fileCache.get(sound);
  if (cached) return cached;

  const buffer = await renderSoundToBuffer(sound);
  const blob = audioBufferToWavBlob(buffer);
  const file = new File([blob], `${sound}.wav`, { type: "audio/wav" });
  fileCache.set(sound, file);
  return file;
}
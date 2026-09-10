"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import type { AudioTrack, UploadedAudio } from "@/types";
import { saveAudioBlob, getAudioBlobs, deleteAudioBlob } from "@/lib/video-project-cache";

const MAX_AUDIO_TRACKS = 8;

interface UseAudioTracksParams {
  videoDuration: number;
  isExportingRef: React.MutableRefObject<boolean>;
  selectedAudioTrackId?: string | null;
  setSelectedAudioTrackId?: (id: string | null) => void;
  lastCopyActionRef?: React.MutableRefObject<'element' | 'zoom' | 'motion' | 'audio' | null>;
}

export function useAudioTracks({ videoDuration, isExportingRef, selectedAudioTrackId, setSelectedAudioTrackId, lastCopyActionRef }: UseAudioTracksParams) {
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [muteOriginalAudio, setMuteOriginalAudio] = useState<boolean>(false);
  const [masterVolume, setMasterVolume] = useState<number>(1);
  const [autoTrimModalOpen, setAutoTrimModalOpen] = useState(false);
  const [pendingAudioUpload, setPendingAudioUpload] = useState<{ audio: UploadedAudio; trackId: string } | null>(null);

  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const restoredAudiosRef = useRef(false);

  useEffect(() => {
    const currentElements = audioElementsRef.current;
    const currentTrackIds = new Set(audioTracks.map(t => t.id));
    for (const [trackId, audioEl] of currentElements.entries()) {
      if (!currentTrackIds.has(trackId)) {
        audioEl.pause(); audioEl.src = ''; currentElements.delete(trackId);
      }
    }
    for (const track of audioTracks) {
      if (!currentElements.has(track.id)) {
        const audio = uploadedAudios.find(a => a.id === track.audioId);
        if (audio) {
          const audioEl = new Audio(audio.url);
          audioEl.preload = 'auto';
          audioEl.volume = track.volume * masterVolume;
          currentElements.set(track.id, audioEl);
        }
      }
    }
  }, [audioTracks, uploadedAudios, masterVolume]);

  useEffect(() => {
    const currentElements = audioElementsRef.current;
    for (const track of audioTracks) {
      const audioEl = currentElements.get(track.id);
      if (audioEl) audioEl.volume = track.volume * masterVolume;
    }
  }, [audioTracks, masterVolume]);

  useEffect(() => {
    const elementsRef = audioElementsRef.current;
    return () => {
      for (const audioEl of elementsRef.values()) { audioEl.pause(); audioEl.src = ''; }
      elementsRef.clear();
    };
  }, []);

  const syncAudioPlayback = useCallback((videoTime: number, playing: boolean) => {
    if (isExportingRef.current) return;
    const currentElements = audioElementsRef.current;
    for (const track of audioTracks) {
      const audioEl = currentElements.get(track.id);
      if (!audioEl) continue;
      const trackStart = track.startTime;
      const trackEnd = track.startTime + track.duration;
      const trimStart = track.trimStart ?? 0;
      if (videoTime >= trackStart && videoTime < trackEnd) {
        const audioTime = trimStart + (videoTime - trackStart);
        if (Math.abs(audioEl.currentTime - audioTime) > 0.1) audioEl.currentTime = audioTime;
        if (playing && audioEl.paused) audioEl.play().catch(() => {});
        else if (!playing && !audioEl.paused) audioEl.pause();
      } else if (!audioEl.paused) {
        audioEl.pause();
      }
    }
  }, [audioTracks, isExportingRef]);

  const handleAudioUpload = useCallback(async (file: File) => {
    try {
      if (audioTracks.length >= MAX_AUDIO_TRACKS) {
        alert(`Maximum of ${MAX_AUDIO_TRACKS} audio tracks allowed.`);
        return;
      }
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      await new Promise<void>((resolve, reject) => {
        audio.addEventListener('loadedmetadata', () => resolve());
        audio.addEventListener('error', () => reject(new Error('Failed to load audio')));
      });
      const newAudio: UploadedAudio = { id: `audio-${crypto.randomUUID()}`, name: file.name, url, duration: audio.duration, fileSize: file.size, mimeType: file.type };
      setUploadedAudios(prev => [...prev, newAudio]);

      // Bloque F: persist audio blob to IndexedDB for survival across reloads
      saveAudioBlob(newAudio.id, file, {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        duration: audio.duration,
      }).catch(err => console.error("Failed to persist audio blob:", err));

      const lastTrackEnd = audioTracks.reduce((max, track) => Math.max(max, track.startTime + track.duration), 0);
      const trackId = `track-${crypto.randomUUID()}`;
      if (audio.duration > videoDuration) {
        setPendingAudioUpload({ audio: newAudio, trackId });
        setAutoTrimModalOpen(true);
      } else {
        const newTrack: AudioTrack = { id: trackId, audioId: newAudio.id, name: newAudio.name, startTime: lastTrackEnd, duration: newAudio.duration, volume: 1, loop: false };
        setAudioTracks(prev => [...prev, newTrack]);
        if (audioTracks.length === 0) setMuteOriginalAudio(true);
      }
    } catch (error) {
      console.error('Error uploading audio:', error);
      alert('Error uploading the audio. Please try again.');
    }
  }, [audioTracks, videoDuration]);

  const handleAudioDelete = useCallback((audioId: string) => {
    setUploadedAudios(prev => {
      const audio = prev.find(a => a.id === audioId);
      if (audio) URL.revokeObjectURL(audio.url);
      return prev.filter(a => a.id !== audioId);
    });
    setAudioTracks(prev => prev.filter(track => track.audioId !== audioId));
    // Bloque F: remove persisted blob from IndexedDB
    deleteAudioBlob(audioId).catch(err => console.error("Failed to delete audio blob:", err));
  }, []);

  const handleAddAudioTrack = useCallback((audioId: string) => {
    const audio = uploadedAudios.find(a => a.id === audioId);
    if (!audio) return;
    if (audioTracks.length >= MAX_AUDIO_TRACKS) { alert(`Maximum of ${MAX_AUDIO_TRACKS} audio tracks allowed.`); return; }
    if (audioTracks.some(track => track.audioId === audioId)) return;
    const lastTrackEnd = audioTracks.reduce((max, track) => Math.max(max, track.startTime + track.duration), 0);
    const newTrack: AudioTrack = { id: `track-${crypto.randomUUID()}`, audioId, name: audio.name, startTime: lastTrackEnd, duration: audio.duration, volume: 1, loop: false };
    setAudioTracks(prev => [...prev, newTrack]);
    if (audioTracks.length === 0) setMuteOriginalAudio(true);
  }, [uploadedAudios, audioTracks]);

  const handleUpdateAudioTrack = useCallback((trackId: string, updates: Partial<AudioTrack>) => {
    setAudioTracks(prev => prev.map(track => track.id === trackId ? { ...track, ...updates } : track));
  }, []);

  const handleDeleteAudioTrack = useCallback((trackId: string) => {
    setAudioTracks(prev => {
      const remaining = prev.filter(track => track.id !== trackId);
      if (remaining.length === 0) setMuteOriginalAudio(false);
      return remaining;
    });
  }, []);

  // Copy / Paste audio tracks
  const [copiedAudioTrack, setCopiedAudioTrack] = useState<Omit<AudioTrack, 'id' | 'startTime'> | null>(null);

  const copySelectedAudioTrack = useCallback(() => {
    const track = audioTracks.find(t => t.id === selectedAudioTrackId);
    if (!track) return;
    const { id: _id, startTime: _st, ...config } = track;
    setCopiedAudioTrack(config);
    if (lastCopyActionRef) lastCopyActionRef.current = 'audio';
  }, [audioTracks, selectedAudioTrackId, lastCopyActionRef]);

  const pasteAudioTrack = useCallback(() => {
    if (!copiedAudioTrack) return;
    const audio = uploadedAudios.find(a => a.id === copiedAudioTrack.audioId);
    if (!audio) return;
    if (audioTracks.length >= MAX_AUDIO_TRACKS) {
      alert(`Maximum of ${MAX_AUDIO_TRACKS} audio tracks allowed.`);
      return;
    }
    const lastTrackEnd = audioTracks.reduce((max, t) => Math.max(max, t.startTime + t.duration), 0);
    const startTime = Math.min(lastTrackEnd, videoDuration);
    const newTrack: AudioTrack = {
      ...copiedAudioTrack,
      id: `track-${crypto.randomUUID()}`,
      startTime,
    };
    setAudioTracks(prev => [...prev, newTrack]);
    setSelectedAudioTrackId?.(newTrack.id);
  }, [copiedAudioTrack, uploadedAudios, audioTracks, videoDuration, setSelectedAudioTrackId]);

  const handleToggleMuteOriginalAudio = useCallback(() => setMuteOriginalAudio(prev => !prev), []);
  const handleMasterVolumeChange = useCallback((volume: number) => setMasterVolume(volume), []);

  const confirmAudioTrim = useCallback((trimStart: number, trimEnd: number) => {
    if (pendingAudioUpload) {
      const lastTrackEnd = audioTracks.reduce((max, track) => Math.max(max, track.startTime + track.duration), 0);
      const newTrack: AudioTrack = { id: pendingAudioUpload.trackId, audioId: pendingAudioUpload.audio.id, name: pendingAudioUpload.audio.name, startTime: lastTrackEnd, duration: trimEnd - trimStart, trimStart, volume: 1, loop: false };
      setAudioTracks(prev => [...prev, newTrack]);
      if (audioTracks.length === 0) setMuteOriginalAudio(true);
    }
    setAutoTrimModalOpen(false);
    setPendingAudioUpload(null);
  }, [pendingAudioUpload, audioTracks]);

  const cancelAudioTrim = useCallback(() => {
    if (pendingAudioUpload) {
      setUploadedAudios(prev => prev.filter(a => a.id !== pendingAudioUpload.audio.id));
      URL.revokeObjectURL(pendingAudioUpload.audio.url);
      // Bloque F: also delete the persisted blob since upload was cancelled
      deleteAudioBlob(pendingAudioUpload.audio.id).catch(err => console.error("Failed to delete audio blob:", err));
    }
    setAutoTrimModalOpen(false);
    setPendingAudioUpload(null);
  }, [pendingAudioUpload]);

  /**
   * Bloque F: Restore uploaded audios from IndexedDB.
   * Called by the editor after restoring the video project snapshot.
   * Reconstructs UploadedAudio objects with fresh blob: URLs.
   */
  const restoreAudios = useCallback(async (audioIds: string[], savedTracks: AudioTrack[], savedMute: boolean, savedMasterVolume: number) => {
    if (restoredAudiosRef.current) return;
    if (audioIds.length === 0) return;

    restoredAudiosRef.current = true;
    const cached = await getAudioBlobs(audioIds);

    const restored: UploadedAudio[] = cached.map(item => ({
      id: item.id,
      name: item.fileName,
      url: URL.createObjectURL(item.blob),
      duration: item.duration,
      fileSize: item.fileSize,
      mimeType: item.mimeType,
    }));

    if (restored.length > 0) {
      setUploadedAudios(restored);
      // Only keep tracks whose audio blob was successfully restored,
      // so we never reference a missing UploadedAudio.
      const restoredIds = new Set(restored.map(a => a.id));
      setAudioTracks((savedTracks ?? []).filter(t => restoredIds.has(t.audioId)));
      setMuteOriginalAudio(savedMute ?? false);
      setMasterVolume(savedMasterVolume ?? 1);
    }
  }, []);

  return {
    uploadedAudios, setUploadedAudios, audioTracks, setAudioTracks,
    muteOriginalAudio, setMuteOriginalAudio, masterVolume, setMasterVolume,
    audioElementsRef, syncAudioPlayback,
    handleAudioUpload, handleAudioDelete, handleAddAudioTrack,
    handleUpdateAudioTrack, handleDeleteAudioTrack,
    copySelectedAudioTrack, pasteAudioTrack, copiedAudioTrack,
    handleToggleMuteOriginalAudio, handleMasterVolumeChange,
    autoTrimModalOpen, pendingAudioUpload, confirmAudioTrim, cancelAudioTrim,
    restoreAudios,
  };
}

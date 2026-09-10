export interface AudioTrack {
    id: string;
    audioId: string;
    name: string;
    startTime: number;
    duration: number;
    volume: number;
    loop: boolean;
    trimStart?: number;
    lane?: number;
}

export interface UploadedAudio {
    id: string;
    name: string;
    url: string;
    duration: number;
    fileSize: number;
    mimeType: string;
}

export interface AudioConfig {
    muteOriginalAudio: boolean;
    tracks: AudioTrack[];
    masterVolume: number;
}

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
    muteOriginalAudio: false,
    tracks: [],
    masterVolume: 1,
};

export const SUPPORTED_AUDIO_FORMATS = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/ogg',
    'audio/aac',
    'audio/m4a',
    'audio/x-m4a',
] as const;

export const SUPPORTED_AUDIO_EXTENSIONS = [
    '.mp3',
    '.wav',
    '.ogg',
    '.aac',
    '.m4a',
] as const;

export const MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024;

export const MAX_AUDIO_TRACKS = 5;

export interface AudioMenuProps {
    audioTracks: AudioTrack[];
    uploadedAudios: UploadedAudio[];
    videoDuration: number;
    onAudioUpload: (file: File) => void;
    onUpdateAudioTrack: (trackId: string, updates: Partial<AudioTrack>) => void;
    onDeleteAudioTrack: (trackId: string) => void;
    selectedAudioTrackId: string | null;
    onSelectAudioTrack: (id: string | null) => void;
}

export const MIN_FRAGMENT_DURATION = 0.1;
export const MIN_VISUAL_WIDTH_PX = 50;

export interface AudioFragmentTrackItemProps {
    track: AudioTrack;
    audio: UploadedAudio | undefined;
    isSelected: boolean;
    contentWidth: number;
    videoDuration: number;
    otherTracks: AudioTrack[];
    onSelect: () => void;
    onUpdate: (updates: Partial<AudioTrack>) => void;
    onDragStateChange?: (isDragging: boolean) => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    contentDuration?: number;
    speed?: number;
    lane?: number;
    laneHeight?: number;
    laneCount?: number;
}

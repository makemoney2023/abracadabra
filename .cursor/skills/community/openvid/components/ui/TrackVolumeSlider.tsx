import { SliderControl } from "@/components/ui/SliderControl";
import { AudioTrack } from "@/types/audio.types";

export function TrackVolumeSlider({ 
    track, 
    onUpdateAudioTrack 
}: { 
    track: AudioTrack; 
    onUpdateAudioTrack: (id: string, updates: Partial<AudioTrack>) => void; 
}) {
    return (
        <SliderControl 
            icon="mdi:volume-medium" 
            label="Volumen" 
            value={Math.round(track.volume * 100)} 
            min={0} 
            max={100} 
            onChange={(value: number) => {
                onUpdateAudioTrack(track.id, { volume: value / 100 });
            }} 
        />
    );
}
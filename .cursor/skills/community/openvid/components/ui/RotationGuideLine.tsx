interface RotationGuideData {
    centerX: number;
    centerY: number;
    snapped: boolean;
    angle: number;
}

interface RotationGuideLineProps {
    rotationGuide: RotationGuideData | null;
}

export function RotationGuideLine({ rotationGuide }: RotationGuideLineProps) {
    if (!rotationGuide) return null;

    return (
        <div
            className="pointer-events-none fixed z-[99999]"
            style={{
                left: rotationGuide.centerX,
                top: rotationGuide.centerY,
                width: rotationGuide.snapped ? 220 : 130,
                height: 1.5,
                backgroundColor: rotationGuide.snapped ? "#3b82f6" : "rgba(255,255,255,0.35)",
                transform: `rotate(${rotationGuide.angle}deg)`,
                transformOrigin: "0 50%",
                transition: "width 0.1s ease, background-color 0.1s ease",
            }}
        />
    );
}
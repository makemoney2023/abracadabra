import { ImageMaskConfigLike } from "./phone3d.utils";

export interface MaskOverflowBox {
  inset?: number;
  insetX?: number;
  insetY?: number;
  deviceWidth: number;
  deviceHeight: number;
}

function remapAxis(pct: number, inset: number, deviceSize: number): number {
  const totalSize = deviceSize + inset * 2;
  if (totalSize <= 0) return pct;
  return ((inset + (pct / 100) * deviceSize) / totalSize) * 100;
}

export function GetMediaMaskStyles(
  maskConfig?: ImageMaskConfigLike | null,
  overflowBox?: MaskOverflowBox
): React.CSSProperties {
  if (!maskConfig || !maskConfig.enabled) return {};

  const insetX = overflowBox?.insetX ?? overflowBox?.inset ?? 0;
  const insetY = overflowBox?.insetY ?? overflowBox?.inset ?? 0;

  const remapY = (pct: number) => overflowBox ? remapAxis(pct, insetY, overflowBox.deviceHeight) : pct;
  const remapX = (pct: number) => overflowBox ? remapAxis(pct, insetX, overflowBox.deviceWidth) : pct;

  const masks: string[] = [];

  if (maskConfig.top) {
    masks.push(`linear-gradient(180deg, transparent ${remapY(maskConfig.top.from)}%, black ${remapY(maskConfig.top.to ?? 100)}%)`);
  }
  if (maskConfig.bottom) {
    masks.push(`linear-gradient(0deg, transparent ${remapY(maskConfig.bottom.from)}%, black ${remapY(maskConfig.bottom.to ?? 100)}%)`);
  }
  if (maskConfig.left) {
    masks.push(`linear-gradient(90deg, transparent ${remapX(maskConfig.left.from)}%, black ${remapX(maskConfig.left.to ?? 100)}%)`);
  }
  if (maskConfig.right) {
    masks.push(`linear-gradient(270deg, transparent ${remapX(maskConfig.right.from)}%, black ${remapX(maskConfig.right.to ?? 100)}%)`);
  }
  if (maskConfig.angle !== undefined) {
    masks.push(`linear-gradient(${maskConfig.angle}deg, transparent ${maskConfig.angleFrom ?? 0}%, black ${maskConfig.angleTo ?? 100}%)`);
  }

  if (masks.length === 0) return {};

  return {
    WebkitMaskImage: masks.join(', '),
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskComposite: 'source-in',
    maskImage: masks.join(', '),
    maskRepeat: 'no-repeat',
    maskComposite: 'intersect',
  };
}

export function applyGradientMaskToRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  maskConfig: ImageMaskConfigLike
) {
  if (!maskConfig?.enabled) return;

  const drawGradient = (cssAngleDeg: number, from: number, to: number) => {
    const a = (cssAngleDeg * Math.PI) / 180;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const diag = Math.sqrt(width * width + height * height);
    const dx = Math.sin(a) * diag;
    const dy = -Math.cos(a) * diag;
    const g = ctx.createLinearGradient(cx - dx / 2, cy - dy / 2, cx + dx / 2, cy + dy / 2);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(Math.max(0, Math.min(1, from / 100)), "rgba(0,0,0,1)");
    g.addColorStop(Math.max(0, Math.min(1, (to ?? 100) / 100)), "rgba(0,0,0,0)");

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = g;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  };

  if (maskConfig.top) drawGradient(180, maskConfig.top.from, maskConfig.top.to ?? 100);
  if (maskConfig.bottom) drawGradient(0, maskConfig.bottom.from, maskConfig.bottom.to ?? 100);
  if (maskConfig.left) drawGradient(90, maskConfig.left.from, maskConfig.left.to ?? 100);
  if (maskConfig.right) drawGradient(270, maskConfig.right.from, maskConfig.right.to ?? 100);
  if (maskConfig.angle !== undefined) {
    drawGradient(maskConfig.angle, maskConfig.angleFrom ?? 0, maskConfig.angleTo ?? 100);
  }
}
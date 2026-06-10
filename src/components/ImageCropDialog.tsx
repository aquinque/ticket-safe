import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, Loader2, Crop as CropIcon } from "lucide-react";

interface ImageCropDialogProps {
  /** Object URL or data URL of the source image to crop. */
  src: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Target aspect ratio (width / height). Defaults to 16:9. */
  aspect?: number;
  /** Called with the cropped image as a File (jpeg) once the user confirms. */
  onCropped: (file: File) => void;
}

/** Draw the selected crop area onto a canvas and export it as a JPEG File. */
async function getCroppedFile(src: string, area: Area, maxWidth = 1600): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const scale = area.width > maxWidth ? maxWidth / area.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width * scale);
  canvas.height = Math.round(area.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    area.x, area.y, area.width, area.height,
    0, 0, canvas.width, canvas.height,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("Could not export the cropped image");
  return new File([blob], "banner.jpg", { type: "image/jpeg" });
}

/**
 * Crop/zoom an image to a fixed aspect ratio before upload. Pan by dragging,
 * zoom with the slider; the result is a clean cropped JPEG so it displays
 * perfectly everywhere it's shown.
 */
export const ImageCropDialog = ({ src, open, onOpenChange, aspect = 16 / 9, onCropped }: ImageCropDialogProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setAreaPixels(pixels), []);

  const handleConfirm = async () => {
    if (!src || !areaPixels) return;
    try {
      setSaving(true);
      const file = await getCroppedFile(src, areaPixels);
      onCropped(file);
      onOpenChange(false);
      // Reset for next time.
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CropIcon className="w-4 h-4 text-primary" />
            Frame your event photo
          </DialogTitle>
        </DialogHeader>

        <div className="relative w-full aspect-[16/9] bg-muted rounded-xl overflow-hidden">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              showGrid
            />
          )}
        </div>

        <div className="flex items-center gap-3 px-1">
          <ZoomIn className="w-4 h-4 text-muted-foreground shrink-0" />
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.01}
            onValueChange={(v) => setZoom(v[0])}
            aria-label="Zoom"
          />
        </div>
        <p className="text-xs text-muted-foreground px-1">Drag to reposition · slide to zoom. The photo is cropped to 16:9.</p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving || !areaPixels}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CropIcon className="w-4 h-4 mr-2" />}
            Use this frame
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

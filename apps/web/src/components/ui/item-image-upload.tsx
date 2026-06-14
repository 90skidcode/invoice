import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ImagePlus, Loader2, X } from 'lucide-react';
import * as React from 'react';

/** Resolves a relative /uploads/… path to a full URL using the API origin. */
export function resolveUploadUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const base = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '/v1';
  // Strip /v1 suffix to get the API origin (e.g. http://localhost:3001)
  const origin = base.startsWith('http') ? new URL(base).origin : '';
  return `${origin}${url}`;
}

/** Resize a File to max 800px on the longest side, returns a JPEG data URL. */
async function resizeToDataUrl(file: File, maxPx = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height * maxPx) / width);
          width = maxPx;
        } else {
          width = Math.round((width * maxPx) / height);
          height = maxPx;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas unavailable')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}

interface ItemImageUploadProps {
  itemId: string;
  imageUrls: string[];
  onChanged: (newUrls: string[]) => void;
  disabled?: boolean;
}

export function ItemImageUpload({ itemId, imageUrls, onChanged, disabled }: Readonly<ItemImageUploadProps>) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [removingUrl, setRemovingUrl] = React.useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      let current = [...imageUrls];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          setError('Only image files are accepted.');
          continue;
        }
        const dataUrl = await resizeToDataUrl(file);
        const result = await api.post<{ url: string; image_urls: string[] }>(
          `/items/${itemId}/image`,
          { image_data: dataUrl },
        );
        current = result.image_urls;
      }
      onChanged(current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemove(url: string) {
    setError(null);
    setRemovingUrl(url);
    try {
      // api.delete doesn't carry a body, so we call fetch directly
      const token = localStorage.getItem('counter_access_token');
      const orgId = localStorage.getItem('counter_org_id');
      const base = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '/v1';
      const res = await fetch(`${base}/items/${itemId}/image`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { 'X-Org-Id': orgId } : {}),
        },
        body: JSON.stringify({ url }),
      });
      const data = await res.json() as { ok: boolean; data?: { image_urls: string[] } };
      if (data.ok && data.data) {
        onChanged(data.data.image_urls);
      } else {
        onChanged(imageUrls.filter((u) => u !== url));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setRemovingUrl(null);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-3">
      {/* Existing images */}
      {imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imageUrls.map((url) => (
            <div key={url} className="relative group rounded-lg overflow-hidden border border-border w-24 h-24 bg-muted/30">
              <img
                src={resolveUploadUrl(url)}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                onClick={() => handleRemove(url)}
                disabled={removingUrl === url || disabled}
                className={cn(
                  'absolute top-1 right-1 rounded-full p-0.5 transition-opacity',
                  'bg-black/60 text-white opacity-0 group-hover:opacity-100',
                  'disabled:opacity-50',
                )}
                aria-label="Remove image"
              >
                {removingUrl === url
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <X className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed',
          'border-border bg-muted/20 py-6 text-center cursor-pointer transition-colors',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50 hover:bg-primary/5',
        )}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <ImagePlus className="h-6 w-6 text-muted-foreground" />
        )}
        <p className="text-xs text-muted-foreground">
          {uploading ? 'Uploading…' : 'Click or drag to add photos'}
        </p>
        <p className="text-[10px] text-muted-foreground/60">JPG, PNG, WebP — resized to 800px automatically</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Small square thumbnail — falls back gracefully if no image. */
export function ItemThumbnail({
  imageUrls,
  size = 'sm',
  className,
}: Readonly<{
  imageUrls: string[];
  size?: 'sm' | 'md';
  className?: string;
}>) {
  const first = imageUrls[0];
  if (!first) return null;
  const px = size === 'sm' ? 'h-8 w-8' : 'h-12 w-12';
  return (
    <img
      src={resolveUploadUrl(first)}
      alt=""
      loading="lazy"
      className={cn(`${px} rounded-md object-cover border border-border shrink-0`, className)}
    />
  );
}

import { useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { cls } from '@foodcourt/shared';
import { uploadMenuImage } from '../lib/api';

/**
 * Dual-mode image picker:
 *   - paste a URL (existing behaviour), or
 *   - upload a file from the device (uploads to Supabase Storage and fills the URL in).
 *
 * Renders a 16:9 preview + a URL textbox below it. The Upload button overlays
 * the preview when empty, and shows as a small action when a URL is set.
 */
export function ImageField({
  value, onChange, restaurantId, label = 'Image', placeholder = 'https://… or upload from device',
}: {
  value: string;
  onChange: (url: string) => void;
  restaurantId: string;          // namespacing in the bucket — also used by RLS
  label?: string;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = () => inputRef.current?.click();
  const clear = () => onChange('');

  const upload = async (file: File) => {
    setErr(null); setUploading(true);
    try {
      const url = await uploadMenuImage(restaurantId, file);
      onChange(url);
    } catch (e: any) {
      setErr(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">{label}</span>

      <div
        className={cls(
          'relative aspect-[16/9] rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden grid place-items-center',
          uploading && 'opacity-70',
        )}
      >
        {value ? (
          <>
            <img src={value} alt="" className="size-full object-cover" onError={() => setErr('Could not load that image.')} />
            <div className="absolute inset-x-0 bottom-0 p-2 flex justify-end gap-2 bg-gradient-to-t from-black/40 to-transparent">
              <button
                type="button"
                onClick={pick}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/95 text-slate-800 px-3 py-1 text-xs font-semibold shadow-sm hover:bg-white"
              >
                <Upload className="size-3.5" /> Replace
              </button>
              <button
                type="button"
                onClick={clear}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/95 text-rose-600 px-3 py-1 text-xs font-semibold shadow-sm hover:bg-white"
              >
                <X className="size-3.5" /> Clear
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={pick}
            disabled={uploading}
            className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-brand-700"
          >
            {uploading ? <Loader2 className="size-7 animate-spin" /> : <ImageIcon className="size-7" />}
            <span className="text-xs font-semibold">{uploading ? 'Uploading…' : 'Upload from device'}</span>
            <span className="text-[10px] text-slate-400">JPG, PNG · up to 5 MB</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />

      <div className="mt-2 flex items-center gap-2">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title="Upload from device"
        >
          <Upload className="size-4" />
        </button>
      </div>

      {err && <p className="mt-1.5 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

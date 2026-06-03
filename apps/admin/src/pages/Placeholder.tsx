import { ExternalLink } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  cta?: { label: string; href: string };
}

export default function Placeholder({ title, subtitle, cta }: Props) {
  return (
    <div className="grid place-items-center h-full min-h-[60vh]">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-slate-500 mt-2">{subtitle ?? 'Coming soon — wire this once the dashboard is approved.'}</p>
        {cta && (
          <a
            href={cta.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 mt-5 rounded-full bg-brand-600 text-white px-5 py-2.5 font-semibold hover:bg-brand-700 transition"
          >
            {cta.label}
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}

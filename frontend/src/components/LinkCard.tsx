import { ArrowUpRight } from "lucide-react";
import { normalizeUrl } from "@/lib/hooks";
import type { Link } from "@/lib/types";

export function LinkCard({ link, index }: { link: Link; index: number }) {
  return (
    <a
      href={normalizeUrl(link.url)}
      target="_blank"
      rel="noreferrer"
      className="group relative flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 hover:-translate-y-1 hover:shadow-[0_14px_30px_-14px_rgba(234,88,12,0.45)] hover:border-orange-300 transition-[transform,box-shadow,border-color] duration-200 animate-rise"
      style={{ animationDelay: `${index * 50}ms` }}
      data-testid={`link-card-${link.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800">
          {link.category}
        </span>
        <ArrowUpRight className="size-5 text-stone-400 group-hover:text-orange-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-[color,transform] duration-200" />
      </div>
      <h3 className="font-heading text-lg font-bold text-stone-900">{link.title}</h3>
      {link.description && <p className="text-sm text-stone-600">{link.description}</p>}
    </a>
  );
}

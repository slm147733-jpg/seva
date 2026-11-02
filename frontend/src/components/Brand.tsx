import { Link } from "react-router-dom";

export function BrandMark({ className = "size-9" }: { className?: string }) {
  return (
    <span
      className={`${className} grid place-items-center rounded-xl bg-gradient-to-br from-orange-600 via-orange-500 to-yellow-400 text-white font-heading font-extrabold shadow-[0_6px_18px_-6px_rgba(234,88,12,0.7)]`}
      aria-hidden
    >
      स
    </span>
  );
}

export function Brand({ name, dark = false }: { name: string; dark?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 group" data-testid="brand-home-link">
      <BrandMark />
      <span
        className={`font-heading text-lg font-extrabold tracking-tight transition-colors duration-200 ${
          dark ? "text-stone-50" : "text-stone-900 group-hover:text-orange-700"
        }`}
        data-testid="brand-name"
      >
        {name}
      </span>
    </Link>
  );
}

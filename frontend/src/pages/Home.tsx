import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Clock, Users } from "lucide-react";
import PublicLayout from "@/components/PublicLayout";
import { LinkCard } from "@/components/LinkCard";
import { buttonVariants } from "@/components/ui/button";
import { DEFAULT_SITE, useSite } from "@/lib/hooks";

const HERO_IMG =
  "https://images.unsplash.com/photo-1522071820081-009f0129c71c?crop=entropy&cs=srgb&fm=jpg&q=80&w=1200";

export default function Home() {
  const { data, isError, isLoading } = useSite();
  const site = data && !isError ? data : DEFAULT_SITE;
  const s = site.settings;

  return (
    <PublicLayout>
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,#FEF3C7_0%,#FFEDD5_55%,#FAFAF9_100%)]" />
        <div className="absolute -top-24 -right-24 -z-10 size-[420px] rounded-full bg-yellow-300/40 blur-3xl" />
        <div className="mx-auto max-w-7xl px-4 md:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center pt-14 pb-20">
          <div className="lg:col-span-7 animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-3 py-1 text-xs font-semibold text-white">
              <ShieldCheck className="size-3.5" /> {s.tagline}
            </span>
            <h1
              className="mt-6 text-4xl sm:text-5xl lg:text-[56px] font-extrabold tracking-tight leading-[1.05] text-stone-900"
              data-testid="hero-title"
            >
              {s.hero_title}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-stone-700 leading-relaxed" data-testid="hero-subtitle">
              {s.hero_subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {site.nav_pages[0] && (
                <Link
                  to={`/p/${site.nav_pages[0].slug}`}
                  className={`${buttonVariants({ size: "lg" })} h-12 px-6 text-base active:scale-[0.98] transition-transform`}
                  data-testid="hero-primary-cta"
                >
                  Explore {site.nav_pages[0].title} <ArrowRight className="size-4" />
                </Link>
              )}
              <Link
                to="/login"
                className={`${buttonVariants({ variant: "outline", size: "lg" })} h-12 px-6 text-base bg-white/70`}
                data-testid="hero-login-cta"
              >
                Member login
              </Link>
            </div>
          </div>
          <div className="lg:col-span-5 relative animate-rise" style={{ animationDelay: "120ms" }}>
            <img
              src={HERO_IMG}
              alt="Sevakendra team helping citizens"
              className="aspect-[4/5] w-full rounded-3xl object-cover shadow-2xl"
            />
            <div className="absolute -bottom-6 -left-6 rounded-2xl bg-white/90 backdrop-blur-md border border-white p-4 shadow-xl w-60">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
                  <Clock className="size-5" />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-wider text-stone-500">Open</p>
                  <p className="font-heading font-bold text-stone-900">Mon – Sat, 9:30 AM</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {site.nav_pages.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 md:px-8 pt-16" data-testid="home-pages-section">
          <p className="text-xs uppercase tracking-wider text-orange-700 font-semibold">Explore</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">What we offer</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {site.nav_pages.map((p, i) => (
              <Link
                key={p.id}
                to={`/p/${p.slug}`}
                className={`group rounded-2xl p-6 border transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lg animate-rise ${
                  i === 0 ? "md:row-span-2 bg-stone-950 text-stone-50 border-stone-900" : "bg-white border-stone-200"
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
                data-testid={`home-page-card-${p.slug}`}
              >
                <h3 className="font-heading text-xl font-bold">{p.title}</h3>
                <p className={`mt-2 text-sm ${i === 0 ? "text-stone-400" : "text-stone-600"}`}>{p.excerpt}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 group-hover:gap-2.5 transition-[gap] duration-200">
                  Read more <ArrowRight className="size-4" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 md:px-8 pt-20" data-testid="home-links-section">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-orange-700 font-semibold">Quick access</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Useful service links</h2>
          </div>
          <Users className="hidden sm:block size-8 text-amber-500" />
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-stone-100 animate-pulse" />
            ))}
          {site.links.map((l, i) => (
            <LinkCard key={l.id} link={l} index={i} />
          ))}
          {!isLoading && site.links.length === 0 && (
            <p className="text-stone-500" data-testid="home-links-empty">
              Links will appear here soon.
            </p>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}

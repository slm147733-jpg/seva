import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, Megaphone, Phone, Mail, MapPin } from "lucide-react";
import { Brand } from "@/components/Brand";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DEFAULT_SITE, useSite } from "@/lib/hooks";

const navCls = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
    isActive ? "text-orange-700 bg-orange-50" : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
  }`;

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { data, isError } = useSite();
  const site = data && !isError ? data : DEFAULT_SITE;
  const s = site.settings;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {s.announcement && (
        <div className="bg-orange-600 text-white text-sm" data-testid="announcement-banner">
          <div className="mx-auto max-w-7xl px-4 md:px-8 py-2 flex items-center gap-2">
            <Megaphone className="size-4 shrink-0" />
            <span>{s.announcement}</span>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/85 border-b border-stone-200/80">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-3.5 flex items-center justify-between gap-4">
          <Brand name={s.site_name} />
          <nav className="hidden md:flex items-center gap-1" data-testid="public-nav">
            <NavLink to="/" end className={navCls} data-testid="nav-home-link">
              Home
            </NavLink>
            {site.nav_pages.map((p) => (
              <NavLink key={p.id} to={`/p/${p.slug}`} className={navCls} data-testid={`nav-page-${p.slug}`}>
                {p.title}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className={`${buttonVariants({ size: "lg" })} active:scale-[0.98] transition-transform`}
              data-testid="header-login-button"
            >
              Login
            </Link>
            <Sheet>
              <SheetTrigger
                className="md:hidden p-2 rounded-lg hover:bg-stone-100"
                data-testid="mobile-menu-button"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="right" className="p-6">
                <SheetTitle className="font-heading">{s.site_name}</SheetTitle>
                <div className="mt-6 flex flex-col gap-1">
                  <NavLink to="/" end className={navCls} data-testid="mobile-nav-home">
                    Home
                  </NavLink>
                  {site.nav_pages.map((p) => (
                    <NavLink key={p.id} to={`/p/${p.slug}`} className={navCls} data-testid={`mobile-nav-${p.slug}`}>
                      {p.title}
                    </NavLink>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-stone-950 text-stone-300 mt-20" data-testid="site-footer">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-12 grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <Brand name={s.site_name} dark />
            <p className="mt-4 text-sm text-stone-400 max-w-sm">{s.tagline}</p>
          </div>
          <div className="md:col-span-3">
            <p className="text-xs uppercase tracking-wider text-stone-500 font-medium">Pages</p>
            <ul className="mt-3 space-y-2 text-sm">
              {site.nav_pages.map((p) => (
                <li key={p.id}>
                  <Link to={`/p/${p.slug}`} className="hover:text-orange-400 transition-colors">
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-4 space-y-2.5 text-sm" data-testid="footer-contact">
            <p className="text-xs uppercase tracking-wider text-stone-500 font-medium">Contact</p>
            {s.helpline && (
              <p className="flex items-center gap-2">
                <Phone className="size-4 text-orange-400" /> {s.helpline}
              </p>
            )}
            {s.email && (
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-orange-400" /> {s.email}
              </p>
            )}
            {s.address && (
              <p className="flex items-center gap-2">
                <MapPin className="size-4 text-orange-400" /> {s.address}
              </p>
            )}
          </div>
        </div>
        <div className="border-t border-stone-800 py-4 text-center text-xs text-stone-500">
          © {new Date().getFullYear()} {s.site_name}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";

export default function AuthShell({ title, subtitle, badge, children }: {
  title: string;
  subtitle: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-background">
      <aside className="hidden lg:flex lg:col-span-5 relative overflow-hidden flex-col justify-between p-10 bg-stone-950 text-stone-50">
        <div className="absolute inset-0 opacity-90 bg-[radial-gradient(circle_at_20%_20%,rgba(234,88,12,0.55),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(234,179,8,0.45),transparent_50%)]" />
        <div className="relative">
          <Brand name="Sevakendra" dark />
        </div>
        <div className="relative">
          <h2 className="text-4xl font-extrabold tracking-tight leading-tight">
            Manage your centre's
            <br />
            website, live.
          </h2>
          <p className="mt-4 text-stone-300 max-w-sm">
            Pages, quick links and member accounts — all from one simple control room.
          </p>
        </div>
        <p className="relative text-xs text-stone-500">Secure access · Mobile + password</p>
      </aside>
      <main className="lg:col-span-7 flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-rise">
          <div className="lg:hidden mb-8">
            <Brand name="Sevakendra" />
          </div>
          {badge}
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-stone-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import PublicLayout from "@/components/PublicLayout";
import { ContentBody } from "@/components/ContentBody";
import { apiGet } from "@/lib/api";
import { formatIST } from "@/lib/hooks";
import type { Page } from "@/lib/types";

export default function PageView() {
  const { slug = "" } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["page", slug],
    queryFn: () => apiGet<Page>(`/pages/${slug}`),
    retry: false,
  });

  return (
    <PublicLayout>
      <div className="bg-[linear-gradient(135deg,#FEF3C7_0%,#FFEDD5_100%)] border-b border-orange-100">
        <div className="mx-auto max-w-4xl px-4 md:px-8 py-14">
          <nav className="flex items-center gap-1 text-sm text-stone-600" data-testid="page-breadcrumb">
            <Link to="/" className="hover:text-orange-700">
              Home
            </Link>
            <ChevronRight className="size-4" />
            <span className="text-stone-900 font-medium">{data && !isError ? data.title : slug}</span>
          </nav>
          <h1 className="mt-4 text-4xl md:text-5xl font-extrabold tracking-tight" data-testid="page-title">
            {isLoading ? "Loading…" : data && !isError ? data.title : "Page not found"}
          </h1>
          {data && !isError && data.excerpt && (
            <p className="mt-3 text-lg text-stone-700" data-testid="page-excerpt">
              {data.excerpt}
            </p>
          )}
        </div>
      </div>
      <article className="mx-auto max-w-4xl px-4 md:px-8 py-12 animate-rise">
        {data && !isError ? (
          <>
            <ContentBody text={data.content} />
            <p className="mt-10 text-xs uppercase tracking-wider text-stone-400">
              Last updated {formatIST(data.updated_at)}
            </p>
          </>
        ) : (
          !isLoading && (
            <p className="text-stone-600" data-testid="page-not-found">
              This page doesn't exist or isn't available right now.{" "}
              <Link to="/" className="text-orange-700 font-medium underline">
                Go home
              </Link>
            </p>
          )
        )}
      </article>
    </PublicLayout>
  );
}

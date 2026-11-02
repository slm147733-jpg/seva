// Renders admin-authored plain text: blank lines split paragraphs, "- " lines become bullets.
export function ContentBody({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  return (
    <div className="space-y-5 text-[17px] leading-relaxed text-stone-700" data-testid="page-content">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="space-y-2">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-orange-500" />
                  <span>{l.replace(/^\s*[-*]\s+/, "")}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Zeigt das Regelwerk so an, wie es in Discord aussieht - der Text wird als
 * Discord-Markdown gepflegt, deshalb wird hier dieselbe Teilmenge gerendert
 * (Ueberschriften, fett/kursiv, Zitate, Listen). Bewusst eine kleine eigene
 * Umsetzung statt einer Markdown-Bibliothek: es geht nur um diese wenigen
 * Auszeichnungen, und der Text stammt ausschliesslich von Ownern.
 */
function renderInline(text: string, keyPrefix: string) {
  // **fett** und *kursiv* in Segmente zerlegen.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

export default function RulesView({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="space-y-2 text-sm leading-relaxed text-muted">
      {lines.map((line, i) => {
        const key = `line-${i}`;
        const trimmed = line.trim();

        if (!trimmed) return <div key={key} className="h-3" />;

        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={key} className="pt-3 text-base font-semibold text-foreground">
              {renderInline(trimmed.slice(4), key)}
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={key} className="pt-4 text-lg font-semibold text-foreground">
              {renderInline(trimmed.slice(3), key)}
            </h2>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={key} className="pt-4 text-xl font-bold text-accent">
              {renderInline(trimmed.slice(2), key)}
            </h1>
          );
        }
        if (trimmed.startsWith("> ")) {
          return (
            <blockquote key={key} className="border-l-2 border-accent/50 pl-3 text-muted">
              {renderInline(trimmed.slice(2), key)}
            </blockquote>
          );
        }
        if (/^[-*] /.test(trimmed)) {
          return (
            <div key={key} className="flex gap-2 pl-1">
              <span className="text-accent">•</span>
              <span>{renderInline(trimmed.slice(2), key)}</span>
            </div>
          );
        }

        return <p key={key}>{renderInline(line, key)}</p>;
      })}
    </div>
  );
}

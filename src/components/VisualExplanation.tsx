const MIN_HEIGHT = 240;
const MAX_HEIGHT = 2000;

function frameHeight(value?: number) {
  const height = Math.round(value ?? 720);
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height));
}

/**
 * Renders a self-contained answer visual without granting it access to the app,
 * storage, JavaScript, forms, or the parent page.
 */
export function VisualExplanation({
  html,
  height,
  title = "Gabarito visual",
}: {
  html?: string;
  height?: number;
  title?: string;
}) {
  if (!html?.trim()) return null;

  return (
    <section className="visual-explanation" aria-label="Gabarito visual">
      <div className="visual-explanation-heading">
        <div>
          <h3>Gabarito visual</h3>
          <p>Material complementar da resposta</p>
        </div>
        <span>HTML isolado</span>
      </div>
      <iframe
        className="visual-explanation-frame"
        title={title}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={html}
        style={{ height: `${frameHeight(height)}px` }}
      />
    </section>
  );
}

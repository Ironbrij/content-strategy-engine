import { useEffect, useRef } from "react";

const WIDGET_SRC = "https://ironbrij-coffee-support.vercel.app/widget.js";
const TARGET_ID = "ironbrij-support";

// Ironbrij's embeddable support widget. React doesn't run a <script> written in
// JSX the way a plain HTML page does, so the tag is added after mount, right
// after the target div as in the embed snippet. Unmounting removes the container
// along with the script, so the next visit appends a fresh tag and the widget
// draws again; the existing-tag check stops a second tag on a dev double mount.
export function SupportWidget({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || container.querySelector("script")) return;

    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    script.dataset.target = TARGET_ID;
    script.dataset.site = "ironbrij";
    script.dataset.page = "website";
    script.dataset.maxWidth = "760";
    script.dataset.radius = "20";
    container.appendChild(script);
  }, []);

  return (
    <div ref={containerRef} className={className}>
      <div id={TARGET_ID} />
    </div>
  );
}

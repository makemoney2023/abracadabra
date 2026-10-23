"use client";

import * as React from "react";

/**
 * Cell content sits above the row's link and ignores the pointer, so a click
 * on plain text opens the row. A tooltip trigger has to take the pointer to
 * show its tooltip. Mark it `data-forward-click` and this passes its click on
 * to the row link, modifier keys included.
 */
export function RowClickForwarder() {
  const mark = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const root = mark.current?.closest("[data-slot=data-table]");
    if (!root) return;
    function onClick(event: Event) {
      const click = event as MouseEvent;
      const target = click.target;
      if (!(target instanceof Element) || !target.closest("[data-forward-click]")) return;
      const link = target.closest("tr")?.querySelector<HTMLAnchorElement>("a[data-row-link]");
      if (!link) return;
      link.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
          ctrlKey: click.ctrlKey,
          metaKey: click.metaKey,
          shiftKey: click.shiftKey,
          altKey: click.altKey,
        }),
      );
    }
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  return <span ref={mark} hidden />;
}

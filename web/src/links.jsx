import { useEffect, useLayoutEffect, useState } from "react";

const storeKey = "flow:links";

export function readLinkMode() {
  try {
    return localStorage.getItem(storeKey) === "on";
  } catch {
    return false;
  }
}

export function useLinkMode() {
  const [on, setOn] = useState(readLinkMode);
  function toggle() {
    setOn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storeKey, next ? "on" : "off");
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }
  return [on, toggle];
}

export function LinkToggle({ on, onToggle }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title="Draw lines between the same marked phrase in other steps."
      onClick={onToggle}
    >
      {on ? "Hide links" : "Show links"}
    </button>
  );
}

export function setLinkFocus(root, target, setFocus) {
  if (!root) {
    setFocus(null);
    return;
  }
  if (
    target?.closest?.(
      ".pass-name, .meta, .field-name, .nav, button, label, textarea",
    )
  ) {
    return;
  }
  clearScope(root);
  const mark = target?.closest?.("mark.tip");
  const scope =
    target?.closest?.(".field") ||
    target?.closest?.(".pass") ||
    target?.closest?.(".tracks-col");
  if (!scope || !root.contains(scope)) {
    setFocus(null);
    return;
  }
  const marks = [...scope.querySelectorAll("mark.tip")];
  if (!marks.length) {
    setFocus(null);
    return;
  }
  const keys = unique(
    (mark ? [mark] : marks).map((item) => item.dataset.link).filter(Boolean),
  );
  if (!keys.length) {
    setFocus(null);
    return;
  }
  scope.dataset.linkScope = "on";
  setFocus({ keys });
}

export function clearLinkFocus(root, setFocus) {
  if (root) clearScope(root);
  setFocus(null);
}

export function LinkWeb({ rootRef, focus }) {
  const [lines, setLines] = useState([]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    paint(root, focus, setLines);
    return () => {
      clearPeers(root);
    };
  }, [rootRef, focus]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !focus) return undefined;
    let frame = 0;
    const redraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => paint(root, focus, setLines));
    };
    const observer = new MutationObserver(redraw);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("scroll", redraw);
    window.addEventListener("scroll", redraw, true);
    window.addEventListener("resize", redraw);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      root.removeEventListener("scroll", redraw);
      window.removeEventListener("scroll", redraw, true);
      window.removeEventListener("resize", redraw);
    };
  }, [rootRef, focus]);

  if (!focus || !lines.length) return null;
  return (
    <svg className="link-web" aria-hidden="true">
      {lines.map((line) => (
        <g key={line.id}>
          <path d={line.d} stroke={line.color} fill="none" />
          <circle cx={line.x1} cy={line.y1} r="2.5" fill={line.color} />
          <circle cx={line.x2} cy={line.y2} r="2.5" fill={line.color} />
        </g>
      ))}
    </svg>
  );
}

function paint(root, focus, setLines) {
  if (!root || !focus?.keys?.length) {
    clearPeers(root);
    setLines([]);
    return;
  }
  const origin = [...root.querySelectorAll("[data-link-scope] mark.tip")].filter(
    (mark) => focus.keys.includes(mark.dataset.link),
  );
  const peers = [];
  for (const key of focus.keys) {
    for (const mark of root.querySelectorAll("mark.tip")) {
      if (mark.dataset.link !== key) continue;
      if (origin.includes(mark)) continue;
      if (samePass(origin[0], mark)) continue;
      peers.push(mark);
    }
  }
  for (const mark of root.querySelectorAll("mark.tip")) {
    mark.classList.toggle(
      "link-peer",
      origin.includes(mark) || peers.includes(mark),
    );
  }
  const next = [];
  for (const start of origin) {
    const key = start.dataset.link;
    const from = boxOf(start);
    if (!from) continue;
    for (const end of peers) {
      if (end.dataset.link !== key) continue;
      const to = boxOf(end);
      if (!to) continue;
      next.push(curve(from, to, key, next.length));
    }
  }
  setLines(next);
}

function boxOf(el) {
  const box = el.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return null;
  return box;
}

function curve(from, to, key, index) {
  const x1 = from.left + from.width / 2;
  const y1 = from.top + from.height / 2;
  const x2 = to.left + to.width / 2;
  const y2 = to.top + to.height / 2;
  const mid = Math.max(48, Math.abs(x2 - x1) * 0.35);
  const d = `M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`;
  return { id: `${key}-${index}`, d, x1, y1, x2, y2, color: hueOf(key) };
}

function samePass(left, right) {
  if (!left || !right) return false;
  const a = left.closest(".pass");
  const b = right.closest(".pass");
  return Boolean(a && a === b);
}

function clearScope(root) {
  for (const node of root.querySelectorAll("[data-link-scope]")) {
    delete node.dataset.linkScope;
  }
  clearPeers(root);
}

function clearPeers(root) {
  if (!root) return;
  for (const mark of root.querySelectorAll("mark.link-peer")) {
    mark.classList.remove("link-peer");
  }
}

function unique(items) {
  return [...new Set(items)];
}

function hueOf(key) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash} 60% 38%)`;
}

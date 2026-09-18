import { useLayoutEffect, useRef } from "react";
import {
  bands,
  highlight,
  line,
  md,
  normalize,
  reportParts,
  skeletonBands,
} from "./lib.js";

export function SweepBoard({ axes, views, onTip }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current;
    normalize(root);
    document.fonts?.ready.then(() => normalize(root));
    const onResize = () => normalize(root);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [axes, views]);

  return (
    <div className="board" ref={ref} style={{ "--cols": axes.schemas.length }}>
      <div className="axis-head">
        {axes.schemas.map((schema) => (
          <div className="axis-item" key={schema.id}>
            <p className="axis-name">{schema.label}</p>
            <p className="axis-note">{schema.note}</p>
            {schema.value ? (
              <pre className="axis-value">{schema.value}</pre>
            ) : null}
          </div>
        ))}
      </div>
      <section className="axis-row">
        {axes.schemas.map((schema) => (
          <Card key={schema.id} view={views[schema.id]} onTip={onTip} />
        ))}
      </section>
    </div>
  );
}

function Card({ view, onTip }) {
  const state = view?.state ?? "idle";
  return (
    <article className="card" data-state={state}>
      <div className="meta">{line(view)}</div>
      <CardBody view={view} onTip={onTip} />
    </article>
  );
}

function CardBody({ view, onTip }) {
  const state = view?.state ?? "idle";
  if (state === "idle") return <Fields parts={{}} />;
  if (state === "run") {
    return (
      <Pass name="draft">
        <Skeleton />
      </Pass>
    );
  }
  if (state === "error" && view.draft === undefined) {
    return <Fields parts={{ body: view.error, bodyName: "error" }} />;
  }
  const draft = (
    <Pass name="draft">
      <MarkedReport value={view.draft} notes={view.notes} onTip={onTip} />
    </Pass>
  );
  if (state === "review") {
    return (
      <>
        {draft}
        <Pass name="skeptic">
          <Skeleton />
        </Pass>
      </>
    );
  }
  if (state === "revise") {
    return (
      <>
        {draft}
        <Pass name="revision">
          <Skeleton />
        </Pass>
      </>
    );
  }
  if (state === "error") {
    return (
      <>
        {draft}
        <Pass name="revision">
          <Fields parts={{ body: view.error, bodyName: "error" }} />
        </Pass>
      </>
    );
  }
  if (view.value === undefined) return draft;
  return (
    <>
      {draft}
      <Pass name="revision">
        <Report value={view.value} />
      </Pass>
    </>
  );
}

export function Pass({ name, role, children }) {
  return (
    <section className="pass" data-pass={role ?? name}>
      <p className="pass-name">{name}</p>
      {children}
    </section>
  );
}

export function Report({ value }) {
  return <Fields parts={reportParts(value)} />;
}

function MarkedReport({ value, notes, onTip }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    highlight(ref.current, notes);
  }, [value, notes]);

  return (
    <div
      ref={ref}
      onMouseOver={(event) => reveal(event.target, onTip)}
      onFocus={(event) => reveal(event.target, onTip)}
      onMouseOut={(event) => conceal(event, onTip)}
      onBlur={() => onTip(null)}
    >
      <Report value={value} />
    </div>
  );
}

export function reveal(target, onTip) {
  const mark = target.closest?.("mark.tip");
  if (!mark) return;
  const box = mark.getBoundingClientRect();
  const top = box.bottom + window.scrollY + 8;
  const left = Math.min(
    box.left + window.scrollX,
    window.scrollX + document.documentElement.clientWidth - 240,
  );
  onTip({
    text: mark.dataset.note ?? "",
    kind: mark.classList.contains("glossary") ? "glossary" : "note",
    top,
    left: Math.max(window.scrollX + 8, left),
  });
}

export function conceal(event, onTip) {
  const mark = event.target.closest?.("mark.tip");
  if (!mark) return;
  if (mark.contains(event.relatedTarget)) return;
  onTip(null);
}

function Fields({ parts }) {
  return bands.map((name) => {
    const text = parts[name];
    const label = name === "body" ? parts.bodyName || "body" : name;
    return (
      <section className="field" data-band={name} key={name}>
        {text ? (
          <>
            <p className="field-name">{label}</p>
            <div
              className="md"
              dangerouslySetInnerHTML={{
                __html: name === "title" ? md(`# ${text}`) : md(text),
              }}
            />
          </>
        ) : null}
      </section>
    );
  });
}

export function Skeleton() {
  const lines = skeletonBands();
  return bands.map((name) => (
    <section className="field" data-band={name} key={name}>
      <p className="field-name">{name}</p>
      <div className="skeleton">
        {lines[name].map((width, index) => (
          <span className="bar" key={index} style={{ width }} />
        ))}
      </div>
    </section>
  ));
}

export function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div
      id="tip"
      data-kind={tip.kind ?? "note"}
      style={{ top: tip.top, left: tip.left }}
    >
      {tip.text}
    </div>
  );
}

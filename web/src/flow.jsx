import { Report, Skeleton } from "./board.jsx";
import { md, unwrap } from "./lib.js";

export function Stage({ view, idle }) {
  const state = view?.state ?? "idle";
  if (state === "idle") return <p className="sidebar-idle">{idle}</p>;
  if (state === "run") return <Skeleton />;
  if (state === "error") {
    return (
      <section className="field">
        <p className="field-name">error</p>
        <div className="md">
          <p>{view.error}</p>
        </div>
      </section>
    );
  }
  return (
    <>
      <p className="meta">{line(view)}</p>
      <Report value={view.value} />
    </>
  );
}

export function Review({ view }) {
  const state = view?.state ?? "idle";
  if (state === "idle") {
    return (
      <p className="sidebar-idle">
        The skeptic waits until the three tracks finish.
      </p>
    );
  }
  if (state === "run") return <Skeleton />;
  if (state === "error") {
    return (
      <section className="field">
        <p className="field-name">error</p>
        <div className="md">
          <p>{view.error}</p>
        </div>
      </section>
    );
  }
  if (!view.notes?.length) {
    return (
      <>
        <p className="meta">{line(view)}</p>
        <p className="sidebar-idle">No weak spans.</p>
      </>
    );
  }
  return (
    <>
      <p className="meta">{line(view)}</p>
      {view.notes.map((note) => (
        <section className="field" key={`${note.quote}:${note.concern}`}>
          <p className="field-name">quote</p>
          <div className="md">
            <p>{note.quote}</p>
          </div>
          <p className="field-name">concern</p>
          <div className="md">
            <p>{note.concern}</p>
          </div>
        </section>
      ))}
    </>
  );
}

export function PlanView({ value, tracks }) {
  const data = unwrap(value);
  if (!data || typeof data !== "object") return <Report value={value} />;
  return (
    <>
      <Block label="approach" text={data.approach} />
      {tracks.map((track) => {
        const item = data.tracks?.[track];
        if (!item) return null;
        return (
          <section className="field" key={track}>
            <p className="field-name">{track}</p>
            <div
              className="md"
              dangerouslySetInnerHTML={{
                __html: md(
                  [item.focus, list(item.queries)].filter(Boolean).join("\n\n"),
                ),
              }}
            />
          </section>
        );
      })}
    </>
  );
}

export function Exec({ value }) {
  const data = unwrap(value);
  if (!data || typeof data !== "object") return <Report value={value} />;
  return (
    <>
      <Block label="headline" text={data.headline ? `# ${data.headline}` : ""} />
      <Block label="salient" text={list(data.salient)} />
      <Block label="caution" text={list(data.caution)} />
    </>
  );
}

export function Merge({ value }) {
  const data = unwrap(value);
  if (!data || typeof data !== "object") return <Report value={value} />;
  return (
    <>
      <Block label="consensus" text={list(data.consensus)} />
      <Block label="disputes" text={list(data.disputes)} />
      <Block label="next steps" text={list(data.nextSteps)} />
      <Block label="title" text={data.title ? `# ${data.title}` : ""} />
      <Block label="recommendation" text={data.recommendation} />
    </>
  );
}

export function Approval({
  approval,
  comment,
  busy,
  wait,
  onComment,
  onApprove,
  onReject,
  onRevise,
}) {
  if (approval === "idle") {
    return <p className="sidebar-idle">{wait}</p>;
  }
  if (approval === "approved") {
    return <p className="sidebar-idle">You approved the brief.</p>;
  }
  return (
    <>
      {approval === "pending" ? (
        <div className="actions">
          <button type="button" onClick={onApprove} disabled={busy}>
            Approve
          </button>
          <button type="button" onClick={onReject} disabled={busy}>
            Reject
          </button>
        </div>
      ) : (
        <p className="sidebar-idle">You rejected the brief.</p>
      )}
      {approval === "rejected" ? (
        <form className="revise" onSubmit={onRevise}>
          <label>
            Revision notes
            <textarea
              rows={3}
              value={comment}
              onChange={(event) => onComment(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            Revise merge
          </button>
        </form>
      ) : null}
    </>
  );
}

export function Block({ label, text }) {
  if (!text) return null;
  return (
    <section className="field">
      <p className="field-name">{label}</p>
      <div
        className="md"
        dangerouslySetInnerHTML={{ __html: md(text) }}
      />
    </section>
  );
}

export function list(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return items.map((item) => `- ${item}`).join("\n");
}

export function line(view) {
  if (!view) return "";
  const parts = [];
  if (view.ms || view.ms === 0) {
    parts.push(
      view.ms >= 1000 ? `${(view.ms / 1000).toFixed(1)}s` : `${view.ms}ms`,
    );
  }
  if (view.tokens?.total) {
    parts.push(`${view.tokens.total.toLocaleString("en-US")} tok`);
  }
  if (view.cached) parts.push("cache");
  return parts.join(" · ");
}

export function spent(views, label) {
  const pile = views.filter(Boolean);
  let total = 0;
  let have = 0;
  for (const view of pile) {
    if (!view.tokens?.total) continue;
    total += view.tokens.total;
    have += 1;
  }
  const extra = have ? ` ${total.toLocaleString("en-US")} tok spent.` : "";
  return `${label}${extra}`;
}

import { md, unwrap } from "./lib.js";
import { Pass, Report, Skeleton } from "./board.jsx";

export function Brief({ brief }) {
  const state = brief?.state ?? "idle";
  return (
    <section className="brief">
      <p className="brief-kicker">Executive brief</p>
      {status(brief) ? <p className="meta">{status(brief)}</p> : null}
      {state === "idle" ? (
        <p className="sidebar-idle">
          The summary and the variations appear after the sweep.
        </p>
      ) : null}
      {state === "chief" ? (
        <Pass name="executive summary" role="chief">
          <Skeleton />
        </Pass>
      ) : null}
      {state === "ok" ? (
        <Pass name="executive summary" role="chief">
          <Exec value={brief.value} />
        </Pass>
      ) : null}
      {state === "error" ? (
        <Pass name="executive summary" role="chief">
          <p className="field-name">error</p>
          <div className="md">
            <p>{brief.error}</p>
          </div>
        </Pass>
      ) : null}
      {state === "reduce" ? (
        <Pass name="variations" role="tally">
          <Skeleton />
        </Pass>
      ) : null}
      {state === "chief" || state === "ok" || state === "error" ? (
        <Pass name="variations" role="tally">
          <Tally value={brief.tally} />
        </Pass>
      ) : null}
    </section>
  );
}

function Exec({ value }) {
  const data = unwrap(value);
  if (!data || typeof data !== "object") return <Report value={value} />;
  return (
    <>
      <Block label="consensus" text={list(data.consensus)} />
      <Block label="disputes" text={list(data.disputes)} />
      <Block label="next steps" text={list(data.nextSteps)} />
      <Block label="title" text={data.title ? `# ${data.title}` : ""} />
      <Block label="summary" text={data.summary} />
    </>
  );
}

function Tally({ value }) {
  const data = unwrap(value);
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return <Report value={value} />;
  return items.map((item, index) => (
    <section className="field" key={`${item.point}-${index}`}>
      <p className="field-name">{`${item.count}×`}</p>
      <div
        className="md"
        dangerouslySetInnerHTML={{ __html: md(item.point) }}
      />
      {item.variants?.length ? (
        <>
          <p className="field-name">variants</p>
          <div
            className="md"
            dangerouslySetInnerHTML={{ __html: md(list(item.variants)) }}
          />
        </>
      ) : null}
    </section>
  ));
}

function Block({ label, text }) {
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

function list(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return items.map((item) => `- ${item}`).join("\n");
}

function status(brief) {
  if (!brief || brief.state === "idle") return "";
  if (brief.state === "reduce") return "Variations";
  if (brief.state === "chief") return "Chief of staff";
  if (brief.state === "error") return "Failed";
  const parts = [fmt(brief.ms), fmtTok(brief.tokens?.total)];
  if (brief.cached) parts.push("cache");
  return parts.filter(Boolean).join(" · ");
}

function fmt(ms) {
  if (!ms && ms !== 0) return "Done";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function fmtTok(n) {
  if (!n) return "";
  return `${n.toLocaleString("en-US")} tok`;
}

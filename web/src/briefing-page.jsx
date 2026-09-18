import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pass, Report, Skeleton, Tip, conceal, reveal } from "./board.jsx";
import {
  LinkToggle,
  LinkWeb,
  clearLinkFocus,
  setLinkFocus,
  useLinkMode,
} from "./links.jsx";
import { Nav } from "./nav.jsx";
import {
  fold,
  highlightGlossary,
  md,
  notesOf,
  postBriefing,
  termsOf,
  unwrap,
  zero,
} from "./lib.js";

const tracks = ["customer", "competitor", "distribution"];
const storeKey = "briefing:v3";

export function Briefing() {
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState(null);
  const [views, setViews] = useState({});
  const [review, setReview] = useState(null);
  const [merged, setMerged] = useState(null);
  const [exec, setExec] = useState(null);
  const [glossary, setGlossary] = useState(null);
  const [approval, setApproval] = useState("idle");
  const [tip, setTip] = useState(null);
  const glossRef = useRef(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [webOn, toggleWeb] = useLinkMode();
  const [linkFocus, setLinkFocusState] = useState(null);

  useEffect(() => {
    document.title = "Market briefing";
    fetch("/api/briefing")
      .then((response) => response.json())
      .then((data) => {
        const store = readStore();
        const nextQuery = store?.query || data.query;
        setQuery(nextQuery);
        if (store && store.query === nextQuery) {
          setPlan(store.plan ?? null);
          setViews(store.views ?? {});
          setReview(store.review ?? null);
          setMerged(store.merged ?? null);
          setExec(store.exec ?? null);
          setGlossary(store.glossary ?? null);
          setApproval(store.approval ?? "idle");
          setComment(store.comment ?? "");
        }
      });
  }, []);

  useLayoutEffect(() => {
    highlightGlossary(glossRef.current, glossary?.terms ?? []);
  }, [glossary, plan, views, review, merged, exec]);

  useEffect(() => {
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, []);

  function persist(next) {
    sessionStorage.setItem(storeKey, JSON.stringify(next));
  }

  function snapshot(extra) {
    return {
      query,
      plan,
      views,
      review,
      merged,
      exec,
      glossary,
      approval,
      comment,
      ...extra,
    };
  }

  async function onRun(event) {
    event.preventDefault();
    const nextQuery = query.trim();
    const fresh = event.nativeEvent.submitter?.value === "fresh";
    if (!nextQuery) return;

    setBusy(true);
    try {
      let nextPlan = { state: "run", ms: 0, tokens: zero() };
      setPlan(nextPlan);
      setViews({});
      setReview(null);
      setMerged(null);
      setExec(null);
      setGlossary(null);
      setApproval("idle");
      persist(
        snapshot({
          query: nextQuery,
          plan: nextPlan,
          views: {},
          review: null,
          merged: null,
          exec: null,
          glossary: null,
          approval: "idle",
        }),
      );

      const planned = await postBriefing({
        phase: "plan",
        query: nextQuery,
        fresh,
      });
      nextPlan = fold(nextPlan, planned);
      if (!planned.ok) {
        nextPlan = { ...nextPlan, state: "error", error: planned.error };
        setPlan(nextPlan);
        persist(snapshot({ query: nextQuery, plan: nextPlan }));
        return;
      }
      nextPlan = { ...nextPlan, value: planned.value, state: "ok" };
      setPlan(nextPlan);

      const nextViews = {};
      await Promise.all(
        tracks.map(async (track) => {
          let view = { state: "run", ms: 0, tokens: zero() };
          nextViews[track] = view;
          setViews({ ...nextViews });
          const result = await postBriefing({
            phase: track,
            query: nextQuery,
            plan: nextPlan.value,
            fresh,
          });
          view = fold(view, result);
          nextViews[track] = result.ok
            ? { ...view, value: result.value, state: "ok" }
            : { ...view, state: "error", error: result.error };
          setViews({ ...nextViews });
        }),
      );

      let nextReview = { state: "run", ms: 0, tokens: zero(), notes: [] };
      setReview(nextReview);
      const crit = await postBriefing({
        phase: "skeptic",
        query: nextQuery,
        tracks: Object.fromEntries(
          tracks.map((track) => [track, nextViews[track]?.value]),
        ),
        fresh,
      });
      nextReview = fold(nextReview, crit);
      if (crit.ok) nextReview = { ...nextReview, notes: notesOf(crit.value) };
      nextReview = crit.ok
        ? { ...nextReview, state: "ok" }
        : { ...nextReview, state: "error", error: crit.error };
      setReview(nextReview);

      const pack = await finishMerge({
        nextQuery,
        nextPlan,
        nextViews,
        nextReview,
        fresh,
        note: "",
      });
      if (pack?.state !== "ok") return;
      const brief = await finishExec({
        nextQuery,
        nextPlan,
        nextViews,
        nextReview,
        pack,
        fresh,
      });
      if (brief?.state !== "ok") return;
      const book = await finishGlossary({
        nextQuery,
        nextPlan,
        nextViews,
        nextReview,
        pack,
        brief,
        fresh,
      });
      persist(
        snapshot({
          query: nextQuery,
          plan: nextPlan,
          views: nextViews,
          review: nextReview,
          merged: pack,
          exec: brief,
          glossary: book,
          approval: book?.state === "ok" ? "pending" : "idle",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function finishMerge({
    nextQuery,
    nextPlan,
    nextViews,
    nextReview,
    fresh,
    note,
  }) {
    let next = { state: "run", ms: 0, tokens: zero() };
    setMerged(next);
    setApproval("idle");
    const result = await postBriefing({
      phase: "merge",
      query: nextQuery,
      tracks: Object.fromEntries(
        tracks.map((track) => [track, nextViews[track]?.value]),
      ),
      notes: nextReview?.notes ?? [],
      comment: note,
      fresh,
    });
    next = fold(next, result);
    if (!result.ok) {
      next = { ...next, state: "error", error: result.error };
      setMerged(next);
      return next;
    }
    next = { ...next, value: result.value, state: "ok" };
    setMerged(next);
    persist(
      snapshot({
        query: nextQuery,
        plan: nextPlan,
        views: nextViews,
        review: nextReview,
        merged: next,
        exec: null,
        approval: "idle",
        comment: note,
      }),
    );
    return next;
  }

  async function finishExec({
    nextQuery,
    nextPlan,
    nextViews,
    nextReview,
    pack,
    fresh,
  }) {
    let next = { state: "run", ms: 0, tokens: zero() };
    setExec(next);
    setApproval("idle");
    const result = await postBriefing({
      phase: "exec",
      query: nextQuery,
      merge: pack.value,
      tracks: Object.fromEntries(
        tracks.map((track) => [track, nextViews[track]?.value]),
      ),
      notes: nextReview?.notes ?? [],
      fresh,
    });
    next = fold(next, result);
    if (!result.ok) {
      next = { ...next, state: "error", error: result.error };
      setExec(next);
      return next;
    }
    next = { ...next, value: result.value, state: "ok" };
    setExec(next);
    persist(
      snapshot({
        query: nextQuery,
        plan: nextPlan,
        views: nextViews,
        review: nextReview,
        merged: pack,
        exec: next,
        glossary: null,
        approval: "idle",
      }),
    );
    return next;
  }

  async function finishGlossary({
    nextQuery,
    nextPlan,
    nextViews,
    nextReview,
    pack,
    brief,
    fresh,
  }) {
    let next = { state: "run", ms: 0, tokens: zero(), terms: [] };
    setGlossary(next);
    setApproval("idle");
    const result = await postBriefing({
      phase: "glossary",
      query: nextQuery,
      corpus: {
        plan: nextPlan.value,
        tracks: Object.fromEntries(
          tracks.map((track) => [track, nextViews[track]?.value]),
        ),
        notes: nextReview?.notes ?? [],
        merge: pack.value,
        exec: brief.value,
      },
      fresh,
    });
    next = fold(next, result);
    if (!result.ok) {
      next = { ...next, state: "error", error: result.error };
      setGlossary(next);
      return next;
    }
    next = { ...next, terms: termsOf(result.value), state: "ok" };
    setGlossary(next);
    setApproval("pending");
    persist(
      snapshot({
        query: nextQuery,
        plan: nextPlan,
        views: nextViews,
        review: nextReview,
        merged: pack,
        exec: brief,
        glossary: next,
        approval: "pending",
      }),
    );
    return next;
  }

  async function onRevise(event) {
    event.preventDefault();
    if (!plan?.value || !merged) return;
    setBusy(true);
    try {
      const pack = await finishMerge({
        nextQuery: query.trim(),
        nextPlan: plan,
        nextViews: views,
        nextReview: review,
        fresh: true,
        note: comment,
      });
      if (pack?.state === "ok") {
        const brief = await finishExec({
          nextQuery: query.trim(),
          nextPlan: plan,
          nextViews: views,
          nextReview: review,
          pack,
          fresh: true,
        });
        if (brief?.state === "ok") {
          await finishGlossary({
            nextQuery: query.trim(),
            nextPlan: plan,
            nextViews: views,
            nextReview: review,
            pack,
            brief,
            fresh: true,
          });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function onApprove() {
    setApproval("approved");
    persist(snapshot({ approval: "approved" }));
  }

  function onReject() {
    setApproval("rejected");
    persist(snapshot({ approval: "rejected" }));
  }

  function onClear() {
    sessionStorage.removeItem(storeKey);
    setPlan(null);
    setViews({});
    setReview(null);
    setMerged(null);
    setExec(null);
    setGlossary(null);
    setApproval("idle");
    setTip(null);
    setComment("");
    clearLinkFocus(glossRef.current, setLinkFocusState);
  }

  return (
    <div className="flow">
      <header>
        <Nav current="briefing" />
        <h1>Market briefing</h1>
        <p className="lede">
          One question. A planner splits the work. Customer, competitor, and
          distribution research run at the same time. A skeptic marks weak
          claims. A merge writes one brief. An executive marks the salient
          points. A glossary agent marks hard terms. Hover a marked term to
          read a plain definition. You approve or reject that brief.
        </p>
      </header>

      <form onSubmit={onRun}>
        <label>
          Question
          <textarea
            name="query"
            rows={2}
            required
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="actions">
          <p className="count">
            {spent(plan, views, review, merged, exec, glossary)}
          </p>
          <button type="button" onClick={onClear} disabled={busy}>
            Clear results
          </button>
          <LinkToggle
            on={webOn}
            onToggle={() => {
              if (webOn) clearLinkFocus(glossRef.current, setLinkFocusState);
              toggleWeb();
            }}
          />
          <button type="submit" name="mode" value="cache" disabled={busy}>
            Run briefing
          </button>
          <button type="submit" name="mode" value="fresh" disabled={busy}>
            Run briefing + bust cache
          </button>
        </div>
      </form>

      {glossary?.state === "run" ? (
        <p className="count">The glossary agent marks hard terms.</p>
      ) : null}
      {glossary?.state === "ok" ? (
        <p className="count">
          {line(glossary)}
          {glossary.terms.length
            ? webOn
              ? ` · ${glossary.terms.length} terms. Hover a marked phrase to see links.`
              : ` · ${glossary.terms.length} terms. Hover a marked word.`
            : " · No hard terms."}
        </p>
      ) : null}

      <div
        className="flow-row"
        ref={glossRef}
        data-web={webOn ? "on" : "off"}
        data-web-hot={webOn && linkFocus ? "on" : "off"}
        onMouseOver={(event) => {
          if (webOn) setLinkFocus(glossRef.current, event.target, setLinkFocusState);
          reveal(event.target, setTip);
        }}
        onFocus={(event) => {
          if (webOn) setLinkFocus(glossRef.current, event.target, setLinkFocusState);
          reveal(event.target, setTip);
        }}
        onMouseOut={(event) => {
          conceal(event, setTip);
          if (!event.currentTarget.contains(event.relatedTarget)) {
            clearLinkFocus(glossRef.current, setLinkFocusState);
          }
        }}
        onBlur={() => setTip(null)}
      >
        <Pass name="planner" role="plan">
          {plan?.state === "ok" ? (
            <>
              <p className="meta">{line(plan)}</p>
              <PlanView value={plan.value} />
            </>
          ) : (
            <Stage view={plan} idle="The planner writes the three-track plan." />
          )}
        </Pass>

        <section className="tracks-col">
          <p className="pass-name">research</p>
          <div className="tracks">
            {tracks.map((track) => (
              <Pass key={track} name={track} role={track}>
                <Stage
                  view={views[track]}
                  idle={`The ${track} track waits for the plan.`}
                />
              </Pass>
            ))}
          </div>
        </section>

        <Pass name="skeptic" role="skeptic">
          <Review view={review} />
        </Pass>

        <Pass name="merge" role="merge">
          {merged?.state === "ok" ? (
            <Merge value={merged.value} />
          ) : (
            <Stage view={merged} idle="The merge waits for the skeptic." />
          )}
          {merged?.state === "ok" || merged?.state === "error" ? (
            <p className="meta">{line(merged)}</p>
          ) : null}
        </Pass>

        <Pass name="executive" role="exec">
          {exec?.state === "ok" ? (
            <>
              <p className="meta">{line(exec)}</p>
              <Exec value={exec.value} />
            </>
          ) : (
            <Stage
              view={exec}
              idle="The executive waits for the merge."
            />
          )}
        </Pass>

        <Pass name="human approval" role="approval">
          <Approval
            approval={approval}
            comment={comment}
            busy={busy}
            onComment={setComment}
            onApprove={onApprove}
            onReject={onReject}
            onRevise={onRevise}
          />
        </Pass>
      </div>
      {webOn ? <LinkWeb rootRef={glossRef} focus={linkFocus} /> : null}
      <Tip tip={tip} />
    </div>
  );
}

function Stage({ view, idle }) {
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

function Review({ view }) {
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

function PlanView({ value }) {
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

function Exec({ value }) {
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

function Merge({ value }) {
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

function Approval({
  approval,
  comment,
  busy,
  onComment,
  onApprove,
  onReject,
  onRevise,
}) {
  if (approval === "idle") {
    return (
      <p className="sidebar-idle">
        Approval waits until the glossary finishes.
      </p>
    );
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

function line(view) {
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

function spent(plan, views, review, merged, exec, glossary) {
  const pile = [
    plan,
    review,
    merged,
    exec,
    glossary,
    ...Object.values(views),
  ].filter(Boolean);
  let total = 0;
  let have = 0;
  for (const view of pile) {
    if (!view.tokens?.total) continue;
    total += view.tokens.total;
    have += 1;
  }
  const extra = have ? ` ${total.toLocaleString("en-US")} tok spent.` : "";
  return `Planner, three tracks, skeptic, merge, executive, glossary, then approval.${extra}`;
}

function readStore() {
  try {
    return JSON.parse(sessionStorage.getItem(storeKey) ?? "null");
  } catch {
    return null;
  }
}

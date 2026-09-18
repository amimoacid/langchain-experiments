import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pass, Tip, conceal, reveal } from "./board.jsx";
import {
  Approval,
  Block,
  Exec,
  Merge,
  PlanView,
  Review,
  Stage,
  line,
  spent,
} from "./flow.jsx";
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
  notesOf,
  postHealth,
  termsOf,
  unwrap,
  zero,
} from "./lib.js";

const tracks = ["clinical", "evidence", "participation"];
const storeKey = "health:v2";

export function Health() {
  const [query, setQuery] = useState("");
  const [persona, setPersona] = useState(null);
  const [stats, setStats] = useState(null);
  const [plan, setPlan] = useState(null);
  const [views, setViews] = useState({});
  const [review, setReview] = useState(null);
  const [merged, setMerged] = useState(null);
  const [exec, setExec] = useState(null);
  const [glossary, setGlossary] = useState(null);
  const [approval, setApproval] = useState("idle");
  const [comment, setComment] = useState("");
  const [tip, setTip] = useState(null);
  const [busy, setBusy] = useState(false);
  const [webOn, toggleWeb] = useLinkMode();
  const [linkFocus, setLinkFocusState] = useState(null);
  const glossRef = useRef(null);

  useEffect(() => {
    document.title = "Health insights";
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => {
        const store = readStore();
        const nextQuery = store?.query || data.query;
        setQuery(nextQuery);
        setPersona(data.persona);
        const ready = data.stats
          ? { ...data.stats, state: "ok" }
          : null;
        setStats(store?.stats ?? ready);
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
  }, [glossary, stats, plan, views, review, merged, exec]);

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
      stats,
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
      let nextStats = { state: "run", ms: 0, tokens: zero() };
      setStats(nextStats);
      setPlan(null);
      setViews({});
      setReview(null);
      setMerged(null);
      setExec(null);
      setGlossary(null);
      setApproval("idle");

      const counted = await postHealth({
        phase: "stats",
        query: nextQuery,
        fresh,
      });
      nextStats = fold(nextStats, counted);
      if (!counted.ok) {
        nextStats = { ...nextStats, state: "error", error: counted.error };
        setStats(nextStats);
        return;
      }
      nextStats = { ...nextStats, value: counted.value, state: "ok" };
      setStats(nextStats);

      let nextPlan = { state: "run", ms: 0, tokens: zero() };
      setPlan(nextPlan);
      const planned = await postHealth({
        phase: "plan",
        query: nextQuery,
        stats: nextStats.value,
        fresh,
      });
      nextPlan = fold(nextPlan, planned);
      if (!planned.ok) {
        nextPlan = { ...nextPlan, state: "error", error: planned.error };
        setPlan(nextPlan);
        persist(snapshot({ query: nextQuery, stats: nextStats, plan: nextPlan }));
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
          const result = await postHealth({
            phase: track,
            query: nextQuery,
            plan: nextPlan.value,
            stats: nextStats.value,
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
      const crit = await postHealth({
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
        nextStats,
        nextPlan,
        nextViews,
        nextReview,
        fresh,
        note: "",
      });
      if (pack?.state !== "ok") return;
      const brief = await finishExec({
        nextQuery,
        nextStats,
        nextPlan,
        nextViews,
        nextReview,
        pack,
        fresh,
      });
      if (brief?.state !== "ok") return;
      await finishGlossary({
        nextQuery,
        nextStats,
        nextPlan,
        nextViews,
        nextReview,
        pack,
        brief,
        fresh,
      });
    } finally {
      setBusy(false);
    }
  }

  async function finishMerge({
    nextQuery,
    nextStats,
    nextPlan,
    nextViews,
    nextReview,
    fresh,
    note,
  }) {
    let next = { state: "run", ms: 0, tokens: zero() };
    setMerged(next);
    setApproval("idle");
    const result = await postHealth({
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
        stats: nextStats,
        plan: nextPlan,
        views: nextViews,
        review: nextReview,
        merged: next,
      }),
    );
    return next;
  }

  async function finishExec({
    nextQuery,
    nextStats,
    nextPlan,
    nextViews,
    nextReview,
    pack,
    fresh,
  }) {
    let next = { state: "run", ms: 0, tokens: zero() };
    setExec(next);
    const result = await postHealth({
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
        stats: nextStats,
        plan: nextPlan,
        views: nextViews,
        review: nextReview,
        merged: pack,
        exec: next,
      }),
    );
    return next;
  }

  async function finishGlossary({
    nextQuery,
    nextStats,
    nextPlan,
    nextViews,
    nextReview,
    pack,
    brief,
    fresh,
  }) {
    let next = { state: "run", ms: 0, tokens: zero(), terms: [] };
    setGlossary(next);
    const result = await postHealth({
      phase: "glossary",
      query: nextQuery,
      corpus: {
        stats: nextStats.value,
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
        stats: nextStats,
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
    if (!plan?.value || !stats?.value) return;
    setBusy(true);
    try {
      const pack = await finishMerge({
        nextQuery: query.trim(),
        nextStats: stats,
        nextPlan: plan,
        nextViews: views,
        nextReview: review,
        fresh: true,
        note: comment,
      });
      if (pack?.state !== "ok") return;
      const brief = await finishExec({
        nextQuery: query.trim(),
        nextStats: stats,
        nextPlan: plan,
        nextViews: views,
        nextReview: review,
        pack,
        fresh: true,
      });
      if (brief?.state === "ok") {
        await finishGlossary({
          nextQuery: query.trim(),
          nextStats: stats,
          nextPlan: plan,
          nextViews: views,
          nextReview: review,
          pack,
          brief,
          fresh: true,
        });
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
    setComment("");
    setTip(null);
    clearLinkFocus(glossRef.current, setLinkFocusState);
  }

  return (
    <div className="flow">
      <header>
        <Nav current="health" />
        <h1>Health insights</h1>
        <p className="lede">
          Redacted FHIR data goes to a stats tool first. An insight researcher
          then uses tools. A planner, three tracks, a skeptic, a merge, an
          executive, and a glossary write a short brief for Elena. You approve
          or reject that brief.
        </p>
        {persona ? (
          <p className="lede">
            Reader: {persona.name}, age band {persona.ageBand},{" "}
            {persona.condition}, {persona.place}. {persona.need}
          </p>
        ) : null}
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
            {spent(
              [stats, plan, review, merged, exec, glossary, ...Object.values(views)],
              "Stats tool, planner, three insight tracks, skeptic, merge, executive, glossary, then approval.",
            )}
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
            Run insights
          </button>
          <button type="submit" name="mode" value="fresh" disabled={busy}>
            Run insights + bust cache
          </button>
        </div>
      </form>

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
        className="flow-row flow-health"
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
        <Pass name="FHIR stats" role="stats">
          {stats?.value ? (
            <>
              <p className="meta">{line(stats)}</p>
              <StatsView value={stats.value} />
            </>
          ) : (
            <Stage
              view={stats}
              idle="The stats tool waits for a run. It does not call a model."
            />
          )}
        </Pass>

        <Pass name="planner" role="plan">
          {plan?.state === "ok" ? (
            <>
              <p className="meta">{line(plan)}</p>
              <PlanView value={plan.value} tracks={tracks} />
            </>
          ) : (
            <Stage view={plan} idle="The planner waits for the stats tool." />
          )}
        </Pass>

        <section className="tracks-col">
          <p className="pass-name">insight research</p>
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
            <Stage view={exec} idle="The executive waits for the merge." />
          )}
        </Pass>

        <Pass name="human approval" role="approval">
          <Approval
            approval={approval}
            comment={comment}
            busy={busy}
            wait="Approval waits until the glossary finishes."
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

function StatsView({ value }) {
  const data = unwrap(value);
  if (!data || typeof data !== "object") return null;
  const counts = data.counts
    ? Object.entries(data.counts).map(([name, n]) => `- ${name}: ${n}`)
    : [];
  const conditions = (data.conditions ?? []).map((item) => {
    const extra = item.note ? `. ${item.note}` : "";
    return `- ${item.code} ${item.display} (${item.recorded || "no date"})${extra}`;
  });
  const meds = (data.medications ?? []).map((item) => {
    const dose = item.dose ? `: ${item.dose}` : "";
    const when = item.authoredOn ? ` from ${item.authoredOn}` : "";
    const change = item.change ? `. ${item.change}` : "";
    return `- ${item.display} (${item.code}) ${item.status}${dose}${when}${change}`;
  });
  const adl = (data.adl ?? []).map((item) => {
    const items = item.items?.length ? `; ${item.items.join(", ")}` : "";
    const note = item.note ? `. ${item.note}` : "";
    return `- ${item.date}: ${item.score}${items}${note}`;
  });
  const labs = (data.labs ?? []).map((item) => {
    const flag = item.flag ? ` (${item.flag})` : "";
    const range = item.range ? `; range ${item.range}` : "";
    const issued = item.issued ? `; reported ${item.issued}` : "";
    return `- ${item.display} ${item.value} ${item.unit} on ${item.date}${flag}${range}${issued}`;
  });
  const surveys = (data.surveys ?? []).map((item) => {
    const answers = (item.answers ?? [])
      .map((row) => `  - ${row.question}: ${row.answer || "(blank)"}`)
      .join("\n");
    return `- ${item.status} ${item.authored}\n${answers}`;
  });
  const tasks = (data.study?.tasks ?? []).map((item) => {
    const due = item.due ? `; due ${item.due}` : "";
    const opens = item.opens ? `; opens ${item.opens}` : "";
    return `- ${item.name} (${item.status}${due}${opens})`;
  });
  const study = data.study
    ? [
        data.study.purpose,
        ...(data.study.aims ?? []).map((aim) => `- ${aim}`),
        `- Surveys done: ${data.study.surveysCompleted}`,
        `- Surveys open: ${data.study.surveysOpen}`,
        `- Samples received: ${data.study.samplesReceived}`,
        data.study.sampleResult ? `- Sample result: ${data.study.sampleResult}` : "",
        `- Next: ${data.study.nextTask} (${data.study.nextDue})`,
      ].filter(Boolean)
    : [];
  const current = data.current
    ? `${data.current.date}: ${data.current.text}`
    : "";
  return (
    <>
      <Block label="redaction" text={data.redaction} />
      <Block label="age band" text={data.ageBand} />
      <Block label="place" text={data.place} />
      <Block label="current status" text={current} />
      <Block label="counts" text={counts.join("\n")} />
      <Block label="conditions" text={conditions.join("\n")} />
      <Block label="medications" text={meds.join("\n")} />
      <Block label="MG-ADL series" text={adl.join("\n")} />
      <Block label="labs" text={labs.join("\n")} />
      <Block label="visits" text={(data.encounters ?? []).map((item) => `- ${item.date}: ${item.type}. ${item.reason}`).join("\n")} />
      <Block label="surveys" text={surveys.join("\n")} />
      <Block label="study purpose" text={study.join("\n")} />
      <Block label="study tasks" text={tasks.join("\n")} />
    </>
  );
}

function readStore() {
  try {
    return JSON.parse(sessionStorage.getItem(storeKey) ?? "null");
  } catch {
    return null;
  }
}

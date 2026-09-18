import { useEffect, useRef, useState } from "react";
import { SweepBoard, Tip } from "./board.jsx";
import { Brief } from "./brief.jsx";
import { Nav } from "./nav.jsx";
import {
  corpusOf,
  fold,
  jobsOf,
  notesOf,
  pool,
  post,
  postBrief,
  remember,
  restore,
  spentLine,
  storageKey,
  zero,
} from "./lib.js";

export function App() {
  const [axes, setAxes] = useState(null);
  const [query, setQuery] = useState("");
  const [views, setViews] = useState({});
  const [brief, setBrief] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState(null);
  const [sideWidth, setSideWidth] = useState(readSide);
  const [drag, setDrag] = useState(false);
  const sideRef = useRef(sideWidth);
  const shellRef = useRef(null);
  sideRef.current = sideWidth;

  useEffect(() => {
    fetch("/api/axes")
      .then((response) => response.json())
      .then((data) => {
        setAxes(data);
        setQuery(data.query);
        const store = restore(data.query, jobsOf(data));
        setViews(store.views);
        setBrief(store.brief);
      });
  }, []);

  useEffect(() => {
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, []);

  useEffect(() => {
    if (!drag) return;
    const shell = shellRef.current;
    if (!shell) {
      setDrag(false);
      return;
    }
    function move(event) {
      setSide(clampSide(shell.right - event.clientX, shell.width));
    }
    function stop() {
      setDrag(false);
      writeSide(sideRef.current);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [drag]);

  if (!axes) return null;

  const jobs = jobsOf(axes);

  function setView(key, view) {
    setViews((current) => {
      const next = { ...current, [key]: view };
      remember(query, next, brief);
      return next;
    });
  }

  async function onSweep(event) {
    event.preventDefault();
    const nextQuery = query.trim();
    const fresh = event.nativeEvent.submitter?.value === "fresh";
    if (!nextQuery) return;

    setBusy(true);
    const latest = {};
    try {
      await pool(jobs, jobs.length, async (job) => {
        let view = { state: "run", ms: 0, tokens: zero(), notes: [] };
        setView(job.key, view);

        const draft = await post({
          phase: "research",
          query: nextQuery,
          schemaId: job.schemaId,
          strategyId: job.strategyId,
          toolsId: job.toolsId,
          fresh,
        });
        view = fold(view, draft);
        if (!draft.ok) {
          const failed = { ...view, state: "error", error: draft.error };
          latest[job.key] = failed;
          setView(job.key, failed);
          return;
        }
        view = { ...view, draft: draft.value, state: "review" };
        setView(job.key, view);

        const review = await post({
          phase: "skeptic",
          query: nextQuery,
          toolsId: job.toolsId,
          draft: view.draft,
          fresh,
        });
        view = fold(view, review);
        if (review.ok) view = { ...view, notes: notesOf(review.value) };
        view = { ...view, state: "revise" };
        setView(job.key, view);

        const revision = await post({
          phase: "revise",
          query: nextQuery,
          schemaId: job.schemaId,
          strategyId: job.strategyId,
          toolsId: job.toolsId,
          draft: view.draft,
          notes: view.notes,
          fresh,
        });
        view = fold(view, revision);
        if (!revision.ok) {
          const failed = { ...view, state: "error", error: revision.error };
          latest[job.key] = failed;
          setView(job.key, failed);
          return;
        }
        const done = { ...view, value: revision.value, state: "ok" };
        latest[job.key] = done;
        setView(job.key, done);
      });

      await runBrief(nextQuery, latest, fresh);
    } finally {
      setBusy(false);
    }
  }

  async function runBrief(nextQuery, latest, fresh) {
    const pack = corpusOf(latest);
    if (!pack.revisions.length) return;

    let next = { state: "reduce", ms: 0, tokens: zero() };
    setBrief(next);
    remember(nextQuery, latest, next);

    const tally = await postBrief({
      phase: "reduce",
      query: nextQuery,
      corpus: pack.revisions,
      fresh,
    });
    next = fold(next, tally);
    if (!tally.ok) {
      next = { ...next, state: "error", error: tally.error };
      setBrief(next);
      remember(nextQuery, latest, next);
      return;
    }
    next = { ...next, tally: tally.value, state: "chief" };
    setBrief(next);

    const chief = await postBrief({
      phase: "chief",
      query: nextQuery,
      corpus: next.tally,
      fresh,
    });
    next = fold(next, chief);
    if (!chief.ok) {
      next = { ...next, state: "error", error: chief.error };
      setBrief(next);
      remember(nextQuery, latest, next);
      return;
    }
    next = { ...next, value: chief.value, state: "ok" };
    setBrief(next);
    remember(nextQuery, latest, next);
  }

  function onClear() {
    sessionStorage.removeItem(storageKey);
    setViews({});
    setBrief(null);
    setTip(null);
  }

  function onResizeStart(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const shell = event.currentTarget.closest(".shell")?.getBoundingClientRect();
    if (!shell) return;
    shellRef.current = shell;
    setDrag(true);
  }

  function onResizeKey(event) {
    const step = event.shiftKey ? 48 : 16;
    let next = sideWidth;
    if (event.key === "ArrowLeft") next = sideWidth + step;
    else if (event.key === "ArrowRight") next = sideWidth - step;
    else return;
    event.preventDefault();
    const shell = event.currentTarget.closest(".shell")?.getBoundingClientRect();
    setSide(clampSide(next, shell?.width ?? 1200));
    writeSide(sideRef.current);
  }

  function setSide(next) {
    sideRef.current = next;
    setSideWidth(next);
  }

  return (
    <div
      className="shell"
      data-drag={drag ? "1" : undefined}
      style={{ "--sidebar": `${sideWidth}px` }}
    >
      <div className="main">
        <header>
          <Nav current="sweep" />
          <h1>Research sweep</h1>
          <p className="lede">
            One query. Six report shapes. One research pass, one skeptic pass,
            and one revision. A reducer tallies the revisions. The chief of
            staff writes one summary.
          </p>
        </header>

        <form onSubmit={onSweep}>
          <label>
            Query
            <textarea
              name="query"
              rows={2}
              required
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="actions">
            <p className="count">{spentLine(axes.cells, views, brief)}</p>
            <button type="button" onClick={onClear} disabled={busy}>
              Clear results
            </button>
            <button type="submit" name="mode" value="cache" disabled={busy}>
              Run sweep
            </button>
            <button type="submit" name="mode" value="fresh" disabled={busy}>
              Run sweep + bust cache
            </button>
          </div>
        </form>

        <SweepBoard axes={axes} views={views} onTip={setTip} />
      </div>
      <button
        type="button"
        className="gutter"
        aria-label="Sidebar width"
        aria-orientation="vertical"
        aria-valuemin={sideMin}
        aria-valuemax={sideMax}
        aria-valuenow={Math.round(sideWidth)}
        onPointerDown={onResizeStart}
        onKeyDown={onResizeKey}
      />
      <aside className="sidebar">
        <Brief brief={brief} />
      </aside>
      <Tip tip={tip} />
    </div>
  );
}

const sideKey = "sweep:sidebar";
const sideMin = 256;
const sideMax = 768;

function readSide() {
  const n = Number(localStorage.getItem(sideKey));
  if (!Number.isFinite(n)) return 384;
  return Math.min(sideMax, Math.max(sideMin, n));
}

function writeSide(n) {
  localStorage.setItem(sideKey, String(Math.round(n)));
}

function clampSide(n, shellWidth) {
  const hi = Math.max(sideMin, Math.min(sideMax, Math.floor(shellWidth * 0.65)));
  return Math.min(hi, Math.max(sideMin, Math.round(n)));
}

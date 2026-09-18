export function Nav({ current }) {
  return (
    <nav className="nav" aria-label="Pages">
      <a href="/" aria-current={current === "sweep" ? "page" : undefined}>
        Sweep
      </a>
      <a
        href="/briefing"
        aria-current={current === "briefing" ? "page" : undefined}
      >
        Briefing
      </a>
      <a
        href="/health"
        aria-current={current === "health" ? "page" : undefined}
      >
        Health
      </a>
    </nav>
  );
}

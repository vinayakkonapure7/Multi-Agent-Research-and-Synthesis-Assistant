import './AppShell.css'

const STEPS = [
  { key: 'sources', label: 'Source material' },
  { key: 'outline', label: 'Outline' },
  { key: 'draft', label: 'Drafting' },
]

/**
 * The persistent frame around every screen: masthead, progress stepper,
 * and the light/dark toggle. Keeping this outside the individual screens
 * means the user always knows where they are and can always get back.
 */
export default function AppShell({
  theme,
  onToggleTheme,
  onHome,
  subtitle,
  stage,
  onStepClick,
  furthestStage,
  children,
}) {
  const currentIndex = STEPS.findIndex(s => s.key === stage)
  const furthestIndex = furthestStage ? STEPS.findIndex(s => s.key === furthestStage) : currentIndex

  return (
    <div className="shell">
      <header className="masthead">
        <button className="masthead__brand" onClick={onHome} title="Back to all reports">
          <span className="masthead__mark">Inkwell</span>
        </button>

        {!subtitle && <span className="masthead__tagline">a desk for research reports</span>}

        {subtitle && <span className="masthead__subtitle" title={subtitle}>{subtitle}</span>}

        <div className="masthead__right">
          <button
            className="masthead__theme"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      {currentIndex !== -1 && (
        <nav className="stepper" aria-label="Progress">
          {STEPS.map((step, i) => {
            const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'ahead'
            const reachable = i <= furthestIndex
            return (
              <button
                key={step.key}
                className={`stepper__step is-${state}`}
                disabled={!reachable || i === currentIndex}
                onClick={() => reachable && onStepClick?.(step.key)}
                aria-current={i === currentIndex ? 'step' : undefined}
              >
                <span className="stepper__num">{i < currentIndex ? '✓' : i + 1}</span>
                <span className="stepper__label">{step.label}</span>
              </button>
            )
          })}
        </nav>
      )}

      <main className="shell__body">{children}</main>
    </div>
  )
}

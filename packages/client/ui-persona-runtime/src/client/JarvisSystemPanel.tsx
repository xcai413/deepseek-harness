import styles from './JarvisSystemPanel.module.css'

export function JarvisSystemPanel(): JSX.Element {
  return (
    <section className={styles.panel} aria-label="JARVIS System Panel">
      <header className={styles.header}>
        <span>J.A.R.V.I.S</span>
        <small>TELEMETRY // ONLINE</small>
      </header>
      <div className={styles.grid}>
        <div><label>MODEL</label><strong>DeepSeek Runtime</strong></div>
        <div><label>SESSION</label><strong>NOMINAL</strong></div>
        <div><label>TOKENS</label><strong>ACTIVE</strong></div>
        <div><label>LATENCY</label><strong>MONITORING</strong></div>
      </div>
    </section>
  )
}

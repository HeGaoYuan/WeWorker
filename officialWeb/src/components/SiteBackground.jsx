/** @param {{ variant?: 'home' | 'plain' }} props */
export default function SiteBackground({ variant = 'plain' }) {
  const isHome = variant === 'home'
  return (
    <>
      <div className={isHome ? 'site-bg site-bg-home' : 'site-bg site-bg-plain'} aria-hidden />
      {isHome ? (
        <>
          <div className="site-hero-purple" aria-hidden />
          <div className="site-hero-purple-soft" aria-hidden />
          <div className="site-aurora" aria-hidden />
          <div className="site-bg-grid site-bg-grid-home" aria-hidden />
        </>
      ) : null}
      <div className="site-noise" aria-hidden />
    </>
  )
}

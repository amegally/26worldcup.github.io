import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useAppData, useData } from '../data/DataContext'
import {
  advanceModel,
  bracketFunnel,
  buildKnockout,
  effectiveGroupOrder,
  groupViews,
} from '../utils/predictBracket'
import BracketCard from '../components/BracketCard'
import BracketTreeCard from '../components/BracketTreeCard'
import './home.css'

/** Shrinks wide content to fit its column (never enlarges). The homepage sample
 *  bracket is intrinsically wider than the aside; this scales it down to a tidy
 *  teaser instead of overflowing. Re-measures on resize and once flags load. */
function FitToWidth({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ scale: 1, h: 0 })
  useLayoutEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    const measure = () => {
      const avail = o.clientWidth
      const nw = i.offsetWidth
      const nh = i.offsetHeight
      if (!nw || !avail) return
      const scale = Math.min(1, avail / nw)
      setBox({ scale, h: nh * scale })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(o)
    const imgs = Array.from(i.querySelectorAll('img'))
    for (const img of imgs) if (!img.complete) img.addEventListener('load', measure, { once: true })
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={outer} className="fit-w" style={{ height: box.h || undefined }}>
      <div ref={inner} className="fit-w-inner" style={{ transform: `scale(${box.scale})` }}>
        {children}
      </div>
    </div>
  )
}

/** the landing page: a single call to action — build your bracket — with a live
 *  sample card (the model's projected bracket) showing the end result. */
export default function Home() {
  const { t } = useI18n()
  const { matches, teams, venues, standings } = useAppData()
  const { simModel, loadSimModel } = useData()
  const [sampleView, setSampleView] = useState<'bracket' | 'list'>('bracket')
  useEffect(() => {
    loadSimModel()
  }, [loadSimModel])

  const sample = useMemo(() => {
    if (!simModel) return null
    const order = effectiveGroupOrder(groupViews(matches, teams, standings, simModel), {})
    const { bracket } = buildKnockout(order, matches, venues, simModel)
    const { winner, parts } = advanceModel(bracket, simModel)
    const champion = winner[bracket.finalN]
    if (!champion) return null
    return { champion, bracket, parts, winner, funnel: bracketFunnel(bracket, parts, winner) }
  }, [simModel, matches, teams, venues, standings])

  return (
    <section className="home">
      <div className="home-main">
        <span className="kicker home-kicker">{t('homeHeroKicker')}</span>
        <h1 className="home-title">{t('homeHeroTitle')}</h1>
        <p className="home-sub">{t('homeHeroSub')}</p>
        <Link to="/predict" className="btn btn-primary home-cta">
          {t('homeHeroCta')}
          <span aria-hidden="true">→</span>
        </Link>
        <p className="home-steps">{t('homeHeroSteps')}</p>
      </div>
      {sample && (
        <div className="home-aside">
          <div className="pr-result-toggle" role="tablist" aria-label={t('predictSampleTagline')}>
            <button
              type="button"
              role="tab"
              aria-selected={sampleView === 'bracket'}
              className={sampleView === 'bracket' ? 'on' : ''}
              onClick={() => setSampleView('bracket')}
            >
              {t('predictResultBracket')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sampleView === 'list'}
              className={sampleView === 'list' ? 'on' : ''}
              onClick={() => setSampleView('list')}
            >
              {t('predictResultList')}
            </button>
          </div>
          {sampleView === 'bracket' ? (
            <FitToWidth>
              <BracketTreeCard
                teams={teams}
                bracket={sample.bracket}
                parts={sample.parts}
                winner={sample.winner}
                champion={sample.champion}
                appName={t('appName')}
                appSub={t('appSub')}
                tagline={t('predictSampleTagline')}
                championLabel={t('predictProjectedChampion')}
                badge={t('predictSampleBadge')}
              />
            </FitToWidth>
          ) : (
            <BracketCard
              teams={teams}
              champion={sample.champion}
              funnel={sample.funnel}
              appName={t('appName')}
              appSub={t('appSub')}
              tagline={t('predictSampleTagline')}
              championLabel={t('predictProjectedChampion')}
              badge={t('predictSampleBadge')}
            />
          )}
          <Link to="/predict" className="home-samplenote">
            {t('homeSampleNote')}
          </Link>
        </div>
      )}
    </section>
  )
}

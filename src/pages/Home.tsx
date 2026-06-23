import { useEffect, useMemo } from 'react'
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
import './home.css'

/** the landing page: a single call to action — build your bracket — with a live
 *  sample card (the model's projected bracket) showing the end result. */
export default function Home() {
  const { t } = useI18n()
  const { matches, teams, venues, standings } = useAppData()
  const { simModel, loadSimModel } = useData()
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
    return { champion, funnel: bracketFunnel(bracket, parts, winner) }
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
          <Link to="/predict" className="home-samplenote">
            {t('homeSampleNote')}
          </Link>
        </div>
      )}
    </section>
  )
}

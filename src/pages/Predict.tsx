import { useEffect, useMemo, useRef, useState } from 'react'
import { toBlob } from 'html-to-image'
import { useI18n } from '../i18n'
import { useAppData, useData } from '../data/DataContext'
import { STAGE_LABEL_KEY } from '../utils/helpers'
import type { Stage } from '../types'
import {
  bracketFunnel,
  buildKnockout,
  effectiveGroupOrder,
  type GroupSelections,
  type GroupView,
  groupViews,
  koWinProb,
  type PredMatch,
  SHORT_NAME,
} from '../utils/predictBracket'
import type { SimModel } from '../sim/engine'
import type { Team } from '../types'
import Flag from '../components/Flag'
import Icon from '../components/Icon'
import BracketCard from '../components/BracketCard'
import BracketTreeCard from '../components/BracketTreeCard'
import LeadLine from '../components/LeadLine'
import './predict.css'

const PICKS_KEY = 'pickpick-predict-v1'
const GROUPS_KEY = 'pickpick-groups-v1'
const MADE_KEY = 'pickpick-made-v1'
const SHARE_PARAM = 'bracket'
const SHARE_VERSION = 1

type Picks = Record<number, string>
type SharedBracket = {
  v: typeof SHARE_VERSION
  g?: GroupSelections
  k?: Record<string, string>
  m?: number
}

function loadMade(): number | null {
  try {
    const v = localStorage.getItem(MADE_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

function loadPicks(): Picks {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PICKS_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Picks = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && /^\d+$/.test(k)) out[Number(k)] = v
    }
    return out
  } catch {
    return {}
  }
}

function loadGroups(): GroupSelections {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GROUPS_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const out: GroupSelections = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = v as string[]
    }
    return out
  } catch {
    return {}
  }
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): string {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function normalizePicks(raw: unknown): Picks {
  if (!raw || typeof raw !== 'object') return {}
  const out: Picks = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(k)
    if (Number.isInteger(n) && n > 0 && typeof v === 'string') out[n] = v.toUpperCase()
  }
  return out
}

function normalizeGroups(raw: unknown): GroupSelections {
  if (!raw || typeof raw !== 'object') return {}
  const out: GroupSelections = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const group = k.toUpperCase()
    if (!/^[A-L]$/.test(group) || !Array.isArray(v) || v.length !== 2) continue
    const teams = v.map((x) => (typeof x === 'string' ? x.toUpperCase() : ''))
    if (teams[0] && teams[1] && teams[0] !== teams[1]) out[group] = teams
  }
  return out
}

function sharedBracketFromUrl(): { picks: Picks; groups: GroupSelections; madeAt: number | null } | null {
  if (typeof window === 'undefined') return null
  const hashQuery = window.location.hash.split('?')[1] ?? ''
  const params = new URLSearchParams(hashQuery || window.location.search)
  const encoded = params.get(SHARE_PARAM)
  if (!encoded || encoded.length > 5000) return null
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as Partial<SharedBracket>
    if (parsed.v !== SHARE_VERSION) return null
    const madeAt = typeof parsed.m === 'number' && Number.isFinite(parsed.m) ? parsed.m : null
    return {
      picks: normalizePicks(parsed.k),
      groups: normalizeGroups(parsed.g),
      madeAt,
    }
  } catch {
    return null
  }
}

function sharePayload(groups: GroupSelections, picks: Picks, madeAt: number | null): string {
  const payload: SharedBracket = {
    v: SHARE_VERSION,
    g: normalizeGroups(groups),
    k: Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, v.toUpperCase()])),
    ...(madeAt != null ? { m: madeAt } : {}),
  }
  return base64UrlEncode(JSON.stringify(payload))
}

function shareUrl(groups: GroupSelections, picks: Picks, madeAt: number | null): string {
  const payload = sharePayload(groups, picks, madeAt)
  const url = new URL(window.location.href)
  url.hash = `/predict?${SHARE_PARAM}=${payload}`
  return url.href
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.left = '-9999px'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  input.remove()
}

/** track a media query (the bracket renders as a tree on wide screens, a
 *  round-by-round stepper on narrow ones) */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export default function Predict() {
  const { t, pick, locale } = useI18n()
  const { matches, teams, venues, standings } = useAppData()
  const { simModel, loadSimModel, refresh } = useData()
  const [updating, setUpdating] = useState(false)
  const [justUpdated, setJustUpdated] = useState(false)
  const importedBracket = useMemo(sharedBracketFromUrl, [])
  useEffect(() => {
    loadSimModel()
  }, [loadSimModel])

  const [picks, setPicks] = useState<Picks>(() => importedBracket?.picks ?? loadPicks())
  const [groupSel, setGroupSel] = useState<GroupSelections>(() => importedBracket?.groups ?? loadGroups())
  const [madeAt, setMadeAt] = useState<number | null>(() => importedBracket?.madeAt ?? loadMade())
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [resultView, setResultView] = useState<'bracket' | 'list'>('bracket')
  const revealRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(PICKS_KEY, JSON.stringify(picks))
    } catch {
      /* private mode */
    }
  }, [picks])
  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(groupSel))
    } catch {
      /* private mode */
    }
  }, [groupSel])

  // groups → predicted finishing orders → knockout seeds, all anchored to today
  const views = useMemo(
    () => (simModel ? groupViews(matches, teams, standings, simModel) : []),
    [matches, teams, standings, simModel],
  )
  const order = useMemo(() => effectiveGroupOrder(views, groupSel), [views, groupSel])
  const { bracket, lockedKo } = useMemo(
    () => (simModel ? buildKnockout(order, matches, venues, simModel) : { bracket: null, lockedKo: {} }),
    [order, matches, venues, simModel],
  )

  useEffect(() => {
    if (!views.length) return
    const validByGroup = new Map(views.map((v) => [v.group, new Set(v.order)]))
    setGroupSel((prev) => {
      let changed = false
      const next: GroupSelections = {}
      for (const [group, selected] of Object.entries(prev)) {
        const valid = validByGroup.get(group)
        if (!valid || selected.length !== 2 || selected[0] === selected[1]) {
          changed = true
          continue
        }
        if (!valid.has(selected[0]) || !valid.has(selected[1])) {
          changed = true
          continue
        }
        next[group] = selected
      }
      return changed ? next : prev
    })
  }, [views])

  useEffect(() => {
    setPicks((prev) => {
      let changed = false
      const next: Picks = {}
      for (const [n, code] of Object.entries(prev)) {
        if (teams[code]) next[Number(n)] = code
        else changed = true
      }
      return changed ? next : prev
    })
  }, [teams])

  // walk the knockout in play order: each tie's two sides are the Round-of-32
  // seeds or the winners the user advanced. A real, finished tie locks its
  // winner; otherwise a stored pick counts only while it is still one of the
  // tie's current participants, so changing anything upstream cascades cleanly.
  const { winner, parts, total, done } = useMemo(() => {
    const winner: Record<number, string> = {}
    const parts: Record<number, { home?: string; away?: string }> = {}
    let total = 0
    let done = 0
    if (!bracket) return { winner, parts, total, done }
    for (const round of bracket.rounds) {
      for (const pm of round) {
        total++
        const home = pm.seedHome ?? (pm.feedHome != null ? winner[pm.feedHome] : undefined)
        const away = pm.seedAway ?? (pm.feedAway != null ? winner[pm.feedAway] : undefined)
        parts[pm.n] = { home, away }
        const locked = lockedKo[pm.n]
        const choice = locked ?? picks[pm.n]
        if (choice && (choice === home || choice === away)) {
          winner[pm.n] = choice
          done++
        }
      }
    }
    return { winner, parts, total, done }
  }, [bracket, picks, lockedKo])

  const complete = total > 0 && done === total
  const champion = bracket ? winner[bracket.finalN] : undefined

  // stamp the date the bracket was first completed, so it travels on the card
  useEffect(() => {
    if (complete && madeAt == null) {
      const now = Date.now()
      setMadeAt(now)
      try {
        localStorage.setItem(MADE_KEY, String(now))
      } catch {
        /* private mode */
      }
    }
  }, [complete, madeAt])
  const madeLabel =
    madeAt != null
      ? t('predictMadeOn', {
          date: new Date(madeAt).toLocaleDateString(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
        })
      : ''

  // the full bracket as a funnel for the results card (every team by exit round)
  const funnel = useMemo(
    () => (bracket ? bracketFunnel(bracket, parts, winner) : []),
    [bracket, parts, winner],
  )

  // matchup lookup by number, for rendering the bracket tree recursively
  const byN = useMemo(() => {
    const m: Record<number, PredMatch> = {}
    if (bracket) for (const round of bracket.rounds) for (const pm of round) m[pm.n] = pm
    return m
  }, [bracket])

  // wide screens get the connected bracket tree; narrow ones a round stepper
  const wide = useMediaQuery('(min-width: 900px)')
  const currentShareUrl = useMemo(() => shareUrl(groupSel, picks, madeAt), [groupSel, picks, madeAt])

  if (!simModel || !bracket) {
    return (
      <div className="pr-page">
        <div className="page-head">
          <h1>{t('predictTitle')}</h1>
          <p>{t('predictSub')}</p>
        </div>
        <p className="muted">{t('predictNeedModel')}</p>
      </div>
    )
  }

  const setPick = (n: number, code: string) => {
    if (lockedKo[n]) return // a finished tie cannot be changed
    setPicks((p) => ({ ...p, [n]: code }))
  }

  const ctx: KoCtx = { byN, parts, winner, lockedKo, model: simModel, teams, onPick: setPick }

  // tap a team in a group to predict its finish: an unranked team becomes the
  // runner-up; tapping the current runner-up promotes it to group winner.
  const toggleGroup = (g: string, code: string) => {
    const view = views.find((v) => v.group === g)
    if (!view || view.complete) return
    setGroupSel((prev) => {
      const cur = prev[g]?.length === 2 ? prev[g] : [...view.defaultTop2]
      let next: string[]
      if (cur[0] === code) next = cur
      else if (cur[1] === code) next = [code, cur[0]]
      else next = [cur[0], code]
      return { ...prev, [g]: next }
    })
  }

  const clearBracket = () => {
    if (window.confirm(t('predictClearConfirm'))) {
      setGroupSel({})
      setPicks({})
      setMadeAt(null)
      try {
        localStorage.removeItem(MADE_KEY)
      } catch {
        /* private mode */
      }
    }
  }

  // pull the latest real results and update everything — decided groups and
  // finished ties refresh to reality, while your own predictions are kept
  const updateToLatest = async () => {
    if (updating) return
    setUpdating(true)
    try {
      await refresh()
      setJustUpdated(true)
      window.setTimeout(() => setJustUpdated(false), 1800)
    } finally {
      setUpdating(false)
    }
  }

  // render the result card to a PNG, then share it (or download where the Web
  // Share API can't take files, e.g. most desktops)
  const shareCard = async (forceDownload: boolean) => {
    const node = document.getElementById('predict-card')
    if (!node || sharing) return
    setSharing(true)
    try {
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(node).backgroundColor || '#faf6ec',
        // the card is centred with margin:auto on the page; neutralise that so it
        // renders flush at the origin of the exported image
        width: node.offsetWidth,
        height: node.offsetHeight,
        style: { margin: '0' },
      })
      if (!blob) return
      const file = new File([blob], 'cup-2026-bracket.png', { type: 'image/png' })
      const championName = champion ? pick(teams[champion].name, champion) : ''
      const canShareFiles =
        !forceDownload && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
      if (canShareFiles) {
        await navigator.share({
          files: [file],
          title: t('appName'),
          text: t('predictShareText', { champion: championName }),
          url: currentShareUrl,
        })
      } else if (!forceDownload && typeof navigator.share === 'function') {
        await navigator.share({
          title: t('appName'),
          text: t('predictShareText', { champion: championName }),
          url: currentShareUrl,
        })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'cup-2026-bracket.png'
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      /* user dismissed the share sheet, or rendering failed — nothing to do */
    } finally {
      setSharing(false)
    }
  }

  const jumpToCard = () => revealRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const showCard = complete && !!champion

  const copyShareLink = async () => {
    try {
      await copyText(currentShareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="pr-page">
      <div className="page-head">
        <h1>{t('predictTitle')}</h1>
        <p>{t('predictSub')}</p>
      </div>

      <div className="pr-sync">
        <span className="kicker">{t('predictLiveNote')}</span>
        {importedBracket && <span className="kicker pr-imported">{t('predictSharedLoaded')}</span>}
        <button
          type="button"
          className={`btn pr-update${justUpdated ? ' done' : ''}`}
          onClick={updateToLatest}
          disabled={updating}
        >
          <Icon name="clock" size={15} />
          {updating ? t('predictUpdating') : justUpdated ? t('predictUpdated') : t('predictUpdate')}
        </button>
        <button type="button" className="btn pr-reset" onClick={clearBracket}>
          {t('predictClear')}
        </button>
      </div>

      <div ref={revealRef}>
        {showCard && champion && (
          <div className="pr-result">
            <div className="pr-result-toggle" role="tablist" aria-label={t('predictKnockoutTitle')}>
              <button
                type="button"
                role="tab"
                aria-selected={resultView === 'bracket'}
                className={resultView === 'bracket' ? 'on' : ''}
                onClick={() => setResultView('bracket')}
              >
                {t('predictResultBracket')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={resultView === 'list'}
                className={resultView === 'list' ? 'on' : ''}
                onClick={() => setResultView('list')}
              >
                {t('predictResultList')}
              </button>
            </div>
            {resultView === 'bracket' ? (
              <BracketTreeCard
                teams={teams}
                bracket={bracket}
                parts={parts}
                winner={winner}
                champion={champion}
                appName={t('appName')}
                appSub={t('appSub')}
                tagline={t('predictCardTagline')}
                championLabel={t('predictYourChampion')}
                date={madeLabel}
                id="predict-card"
                lead
              />
            ) : (
              <BracketCard
                teams={teams}
                champion={champion}
                funnel={funnel}
                appName={t('appName')}
                appSub={t('appSub')}
                tagline={t('predictCardTagline')}
                championLabel={t('predictYourChampion')}
                date={madeLabel}
                id="predict-card"
                lead
              />
            )}
            <div className="pr-share">
              <button
                type="button"
                className="btn btn-primary pr-share-btn"
                disabled={sharing}
                onClick={() => shareCard(false)}
              >
                <Icon name="external" size={16} />
                {sharing ? t('predictSharing') : t('predictShare')}
              </button>
              <button type="button" className="btn" disabled={sharing} onClick={() => shareCard(true)}>
                <Icon name="download" size={16} />
                {t('predictDownload')}
              </button>
              <button type="button" className="btn" disabled={sharing} onClick={copyShareLink}>
                <Icon name="external" size={16} />
                {copied ? t('predictCopied') : t('predictCopyLink')}
              </button>
            </div>
            <p className="muted small pr-share-hint">{t('predictShareHint')}</p>
          </div>
        )}
      </div>

      {/* ---- group stage ---- */}
      <div className="section-title">
        <h2 className="section-title-h">{t('predictGroupsTitle')}</h2>
      </div>
      <p className="muted small pr-legend">{t('predictGroupsHint')}</p>
      <div className="pr-groups">
        {views.map((v) => (
          <GroupCard
            key={v.group}
            view={v}
            order={order[v.group] ?? v.order}
            teams={teams}
            onToggle={toggleGroup}
          />
        ))}
      </div>

      {/* ---- knockout bracket ---- */}
      <div className="section-title pr-ko-head">
        <h2 className="section-title-h">{t('predictKnockoutTitle')}</h2>
        <span className="kicker tnum pr-ko-progress">{t('predictProgress', { done, total })}</span>
      </div>
      <p className="muted small pr-legend">{t('predictPickHint')}</p>

      {wide ? (
        <BracketTree ctx={ctx} finalN={bracket.finalN} champion={champion} teams={teams} />
      ) : (
        <BracketSteps ctx={ctx} rounds={bracket.rounds} champion={champion} teams={teams} />
      )}

      {complete && <LeadLine className="pr-bracket-lead" />}

      {complete && (
        <div className="pr-ready">
          <button type="button" className="pr-ready-btn" onClick={jumpToCard}>
            {t('predictSeeCard')}
            <span aria-hidden="true">↑</span>
          </button>
        </div>
      )}
    </div>
  )
}

/** desktop: the connected bracket tree, R32 → champion */
function BracketTree({
  ctx,
  finalN,
  champion,
  teams,
}: {
  ctx: KoCtx
  finalN: number
  champion?: string
  teams: Record<string, Team>
}) {
  const { t, pick } = useI18n()
  return (
    <div className="kob-wrap">
      <div className="kob-heads" aria-hidden="true">
        {ROUND_ORDER.map((s) => (
          <span className="kob-head kicker" key={s}>
            {t(STAGE_LABEL_KEY[s])}
          </span>
        ))}
        <span className="kob-head kicker kob-head-champ">{t('predictYourChampion')}</span>
      </div>
      <div className="kob">
        <KoNode n={finalN} ctx={ctx} />
        <div className={`kob-champ${champion ? ' has' : ''}`}>
          {champion ? (
            <>
              <Flag team={teams[champion]} size={34} />
              <span className="kob-champ-name">{pick(teams[champion].name, champion)}</span>
            </>
          ) : (
            <span className="kob-champ-tbd">{t('predictYourChampion')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

/** mobile: one round at a time, with a round rail you can tap through */
function BracketSteps({
  ctx,
  rounds,
  champion,
  teams,
}: {
  ctx: KoCtx
  rounds: PredMatch[][]
  champion?: string
  teams: Record<string, Team>
}) {
  const { t, pick } = useI18n()
  const roundDone = (i: number) => rounds[i].every((pm) => ctx.winner[pm.n])
  const roundReady = (i: number) => i === 0 || roundDone(i - 1)
  const roundCount = (i: number) => rounds[i].filter((pm) => ctx.winner[pm.n]).length
  const firstOpen = rounds.findIndex((_, i) => !roundDone(i))
  const [ri, setRi] = useState(firstOpen < 0 ? rounds.length - 1 : firstOpen)
  const idx = Math.min(ri, rounds.length - 1)
  const round = rounds[idx]
  const stage = round[0].stage
  const last = idx === rounds.length - 1

  return (
    <div className="kos">
      <div className="kos-rail">
        {rounds.map((r, i) => {
          const ready = roundReady(i)
          return (
            <button
              type="button"
              key={r[0].stage}
              className={`kos-step${i === idx ? ' on' : ''}${roundDone(i) ? ' done' : ''}`}
              disabled={!ready}
              aria-current={i === idx}
              onClick={() => setRi(i)}
            >
              <span className="kos-step-dot">{roundDone(i) ? '✓' : i + 1}</span>
              <span className="kos-step-lbl">{t(`predictShort_${r[0].stage}`)}</span>
            </button>
          )
        })}
      </div>

      <div className="kos-head">
        <h3>{t(STAGE_LABEL_KEY[stage])}</h3>
        <span className="kicker tnum">
          {roundCount(idx)}/{round.length}
        </span>
      </div>

      <div className="kos-ties">
        {round.map((pm) => (
          <TieNode key={pm.n} pm={pm} ctx={ctx} />
        ))}
      </div>

      {last && champion ? (
        <div className="kos-champ has">
          <span className="kicker">{t('predictYourChampion')}</span>
          <span className="kos-champ-name">
            <Flag team={teams[champion]} size={30} />
            {pick(teams[champion].name, champion)}
          </span>
        </div>
      ) : (
        !last && (
          <button
            type="button"
            className="btn btn-primary kos-next"
            disabled={!roundDone(idx)}
            onClick={() => setRi(idx + 1)}
          >
            {t('predictNextRound')}
            <span aria-hidden="true">→</span>
          </button>
        )
      )}
    </div>
  )
}

const ROUND_ORDER: Stage[] = ['r32', 'r16', 'qf', 'sf', 'final']

interface KoCtx {
  byN: Record<number, PredMatch>
  parts: Record<number, { home?: string; away?: string }>
  winner: Record<number, string>
  lockedKo: Record<number, string>
  model: SimModel
  teams: Record<string, Team>
  onPick: (n: number, code: string) => void
}

/** one matchup in the bracket tree, with its two feeding sub-trees to the left */
function KoNode({ n, ctx }: { n: number; ctx: KoCtx }) {
  const pm = ctx.byN[n]
  if (!pm) return null
  const leaf = pm.stage === 'r32'
  const decided = !!ctx.winner[n]
  return (
    <div className={`kob-node${leaf ? ' is-leaf' : ''}${decided ? ' decided' : ''}`}>
      <div className="kob-tie-slot">
        <TieNode pm={pm} ctx={ctx} />
      </div>
      {!leaf && (
        <div className="kob-children">
          {pm.feedHome != null && <KoNode n={pm.feedHome} ctx={ctx} />}
          {pm.feedAway != null && <KoNode n={pm.feedAway} ctx={ctx} />}
        </div>
      )}
    </div>
  )
}

function GroupCard({
  view,
  order,
  teams,
  onToggle,
}: {
  view: GroupView
  order: string[]
  teams: Record<string, Team>
  onToggle: (g: string, code: string) => void
}) {
  const { t, pick } = useI18n()
  return (
    <div className={`pr-group${view.complete ? ' done' : ''}`}>
      <div className="pr-group-head">
        <span className="pr-group-name">{t('groupX', { x: view.group })}</span>
        {view.complete && <span className="pr-group-final">{t('predictDecided')}</span>}
      </div>
      <ol className="pr-group-rows">
        {order.map((code, i) => {
          const cls = i < 2 ? 'q' : i === 2 ? 'third' : 'out'
          return (
            <li key={code}>
              <button
                type="button"
                className={`pr-group-row ${cls}`}
                disabled={view.complete}
                aria-pressed={i < 2}
                aria-label={`${i + 1}. ${pick(teams[code]?.name, code)}${i < 2 ? ', qualifies' : ''}`}
                onClick={() => onToggle(view.group, code)}
                title={view.complete ? undefined : t('predictThroughHint')}
              >
                <span className="pr-group-pos tnum">{i + 1}</span>
                <Flag team={teams[code]} size={16} />
                <span className="pr-group-nm">{pick(teams[code]?.name, code)}</span>
                {i < 2 && <span className="pr-group-tag">{t('predictThrough')}</span>}
                <span className="pr-group-pts tnum">{view.pts[code] ?? 0}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** a single matchup node: two tappable team slots with the model's win % */
function TieNode({ pm, ctx }: { pm: PredMatch; ctx: KoCtx }) {
  const { t, pick } = useI18n()
  const { teams, model } = ctx
  const home = ctx.parts[pm.n]?.home
  const away = ctx.parts[pm.n]?.away
  const picked = ctx.winner[pm.n]
  const locked = !!ctx.lockedKo[pm.n]
  const ready = !!home && !!away
  const pHome = ready ? koWinProb(model, home as string, away as string, pm.venueCountry) : null
  const favCode = pHome == null ? null : pHome >= 0.5 ? home : away

  return (
    <div className={`pr-tie${picked ? ' has-pick' : ''}${locked ? ' locked' : ''}`}>
      {ready ? (
        [home as string, away as string].map((code) => {
          const sel = picked === code
          const prob = code === home ? (pHome as number) : 1 - (pHome as number)
          return (
            <button
              type="button"
              key={code}
              className={`pr-opt${sel ? ' sel' : ''}${favCode === code ? ' fav' : ''}`}
              aria-pressed={sel}
              disabled={locked}
              title={pick(teams[code]?.name, code)}
              aria-label={`${pick(teams[code]?.name, code)}, ${Math.round(prob * 100)}% to advance`}
              onClick={() => ctx.onPick(pm.n, code)}
            >
              <Flag team={teams[code]} size={17} />
              <span className="pr-opt-nm">{SHORT_NAME[code] ?? pick(teams[code]?.name, code)}</span>
              <span className="pr-opt-pct tnum" aria-hidden="true">
                {Math.round(prob * 100)}
              </span>
            </button>
          )
        })
      ) : (
        <div className="pr-tie-tbd">{t('predictTbd')}</div>
      )}
      {locked && <span className="pr-tie-lock">{t('predictDecided')}</span>}
    </div>
  )
}

import { useI18n } from '../i18n'
import './legal.css'

export default function Terms() {
  const { t } = useI18n()
  const app = t('appName')
  return (
    <div className="legal">
      <div className="page-head">
        <h1>{t('navTerms')}</h1>
        <p>{t('legalUpdated', { date: 'June 23, 2026' })}</p>
      </div>

      <p>
        These Terms govern your use of the {app} web app and bracket game (the “Service”). By using the
        Service, you agree to these Terms. If you do not agree, please do not use the Service.
      </p>

      <div className="legal-callout">
        <strong>For entertainment only — not betting or gambling.</strong> {app} is a free game for fun. It is
        not a betting, gambling, wagering or real-money contest service, and no prizes, winnings or money are
        offered. Win probabilities and forecasts are model estimates shown for entertainment only — they are
        not betting advice and are not predictions of real-world outcomes.
      </div>

      <div className="legal-callout">
        <strong>Not affiliated with FIFA or any official governing body.</strong> {app} is an independent,
        unofficial app. It is not affiliated with, endorsed by, sponsored by, or associated with FIFA or any
        official governing body, confederation, league, federation, team or competition. All team, competition
        and other names and marks are the property of their respective owners and are used for identification
        only.
      </div>

      <h2>The Service</h2>
      <p>
        The Service lets you build, save and share a predicted knockout bracket. It is provided free of
        charge, has no accounts or payments, and runs in your browser.
      </p>

      <h2>No warranty; accuracy of data</h2>
      <p>
        The Service and all data it shows (schedules, fixtures, results, standings, probabilities and
        forecasts) are provided “as is” and “as available”, without warranties of any kind, express or
        implied. Data is sourced from third parties and may be inaccurate, delayed or incomplete, and should
        not be relied upon for any important decision.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Please use the Service lawfully and do not attempt to disrupt, overload or interfere with it. The
        Service’s source code is open source under the MIT license, and you are welcome to use, copy and
        modify it in accordance with that license (see the attribution and license linked in the footer).
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, the Service is provided without liability for any indirect,
        incidental, special or consequential damages, or any loss arising from your use of, or inability to
        use, the Service or its data.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The {app} source code is released under the MIT license. Tournament data, and all team, competition
        and organization names and marks, belong to their respective owners and are used here for
        identification and informational purposes only.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. The current version will always be posted here, with a
        revised “last updated” date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms? Reach out on{' '}
        <a href="https://www.instagram.com/alfred.makes" target="_blank" rel="noreferrer">
          Instagram @alfred.makes
        </a>{' '}
        or open an issue on the project’s{' '}
        <a href="https://github.com/amegally/26worldcup.github.io" target="_blank" rel="noreferrer">
          GitHub repository
        </a>
        .
      </p>
    </div>
  )
}

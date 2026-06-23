import { useI18n } from '../i18n'
import './legal.css'

export default function Privacy() {
  const { t } = useI18n()
  const app = t('appName')
  return (
    <div className="legal">
      <div className="page-head">
        <h1>{t('navPrivacy')}</h1>
        <p>{t('legalUpdated', { date: 'June 23, 2026' })}</p>
      </div>

      <p>
        {app} is a free, open-source web app for building a predicted tournament bracket. It is designed to
        respect your privacy: it runs entirely in your browser, and we do not collect personal information,
        require an account, or ask you to sign in.
      </p>

      <h2>Information we collect</h2>
      <p>
        We do not collect, store on our servers, or sell any personal information about you. {app} has no
        accounts, no email sign-up, no advertising, and no third-party analytics or tracking.
      </p>

      <h2>Data stored on your device</h2>
      <p>
        Your bracket picks, group selections, and preferences (such as language, theme, time zone and favorite
        teams) are saved in your browser’s local storage so the app works offline and remembers your choices
        between visits. This information stays on your device and is never sent to us. You can delete it at
        any time using the in-app reset or by clearing site data in your browser.
      </p>

      <h2>How the app loads content</h2>
      <p>
        The app and its tournament data (schedules, results, standings and probabilities) are served as static
        files from our host, GitHub Pages. Some images, such as team flags, may load from a public image
        provider as a fallback. Like any website, these hosts may automatically record standard technical
        request information (for example, IP address and browser type) in their own server logs. We do not
        control those logs and do not use them to identify you; please see the privacy practices of GitHub and
        any image provider for details.
      </p>

      <h2>Sharing your bracket</h2>
      <p>
        The Share and Save image features create a picture of your bracket on your device. If you choose to
        share it, it is handled by your device’s share menu or the app you select — we are not involved and do
        not receive a copy.
      </p>

      <h2>Cookies and tracking</h2>
      <p>We do not use cookies, advertising, or analytics or tracking technologies.</p>

      <h2>Children</h2>
      <p>
        {app} is suitable for a general audience. Because we do not collect personal information from anyone,
        we do not knowingly collect information from children.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy, we will post the updated version here with a new date. Material changes will
        be reflected in the “last updated” date above.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about your privacy or this policy? Reach out on{' '}
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

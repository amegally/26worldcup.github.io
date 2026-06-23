/** Lead-capture line shown on the shareable card (so it travels with every
 *  screenshot) and under the finished bracket. */
export default function LeadLine({ className = '' }: { className?: string }) {
  return (
    <p className={`lead-line ${className}`}>
      Learn how to build your own apps <span aria-hidden="true">→</span>{' '}
      <a href="https://alfred.substack.com" target="_blank" rel="noreferrer">
        alfred.substack.com
      </a>
      <span className="lead-line-sep"> · IG </span>
      <a href="https://www.instagram.com/alfred.makes" target="_blank" rel="noreferrer">
        @alfred.makes
      </a>
    </p>
  )
}

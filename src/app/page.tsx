/**
 * Home · "Your capital"
 * Not connected → minimal landing (one sentence, one CTA, demo wallet button).
 * Connected / address given → PortfolioHome (hero number, 30D, LP performance, vs HODL headline, exposure bar, top positions).
 * Data: GET /api/portfolio/[address]. The page renders engine output; it computes nothing.
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="hero-num">Your capital</h1>
      <p className="muted mt-2">Connect or paste a Base wallet to see what it is actually earning.</p>
      {/* TODO(Part 3): <WalletEntry/> then <PortfolioHome address=.../> */}
    </main>
  );
}

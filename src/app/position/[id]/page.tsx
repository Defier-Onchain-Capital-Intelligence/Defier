/** Route /position/[id] · id = `${protocol}:${tokenId}` · 9-line P&L table, event history, range bar, Simulate CTA. */
export default async function PositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="mx-auto max-w-5xl px-4 py-12"><h1 className="kpi">Position {id}</h1></main>;
}

import { type MatchResult } from "../domain.js";
import { AdvisorCard } from "./AdvisorCard.js";

type Props = { matches: MatchResult[] };

export function ResultsList({ matches }: Props) {
  if (matches.length === 0) return null;
  return (
    <section className="results" aria-label="matched advisors">
      <h2>
        Top {matches.length} matched advisor{matches.length === 1 ? "" : "s"}
      </h2>
      <div className="results-grid">
        {matches.map((m) => (
          <AdvisorCard key={m.advisor.id} match={m} />
        ))}
      </div>
    </section>
  );
}

import { type MatchResult, INVESTMENT_TYPE_LABELS } from "../domain.js";

type Props = { match: MatchResult };

export function AdvisorCard({ match }: Props) {
  const { advisor, budgetFit, normalizedRating, score } = match;
  return (
    <article className="advisor-card" data-testid={`card-${advisor.id}`}>
      <h3>{advisor.name}</h3>
      <p className="location">{advisor.location}</p>
      <ul className="expertise">
        {advisor.expertise.map((type) => (
          <li key={type} className="badge">
            {INVESTMENT_TYPE_LABELS[type]}
          </li>
        ))}
      </ul>
      <p className="rating">Rating: {advisor.rating.toFixed(1)}/5</p>
      <p className="budget">
        Accepted budget: ${advisor.budgetMin.toLocaleString()} – $
        {advisor.budgetMax.toLocaleString()}
      </p>
      <p className="score" aria-label="match score">
        Match score: {(score * 100).toFixed(0)}% (budget fit {(budgetFit * 100).toFixed(0)}%, rating{" "}
        {(normalizedRating * 100).toFixed(0)}%)
      </p>
    </article>
  );
}

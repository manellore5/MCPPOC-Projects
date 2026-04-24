import { useEffect, useRef, useState } from "react";
import { fetchMatches } from "../api.js";
import {
  INVESTMENT_TYPES,
  INVESTMENT_TYPE_LABELS,
  LOCATIONS,
  RISK_LEVELS,
  RISK_LEVEL_LABELS,
  type InvestmentType,
  type InvestorProfile,
  type MatchResult,
} from "../domain.js";
import {
  emptyForm,
  isValid,
  toProfile,
  validate,
  type FormErrors,
  type FormState,
} from "../validation.js";
import { notifyIframeReady, notifyIframeSize } from "../postMessageBridge.js";
import { ResultsList } from "./ResultsList.js";

type Props = {
  embedded?: boolean;
  fetchImpl?: (profile: InvestorProfile) => Promise<MatchResult[]>;
};

export function AdvisorForm({ embedded = false, fetchImpl = fetchMatches }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MatchResult[] | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);

  const errors: FormErrors = validate(form);
  const canSubmit = isValid(form) && !loading;

  useEffect(() => {
    if (!embedded) return;
    notifyIframeReady();
  }, [embedded]);

  useEffect(() => {
    if (!embedded) return;
    const el = rootRef.current;
    if (!el) return;
    notifyIframeSize(el.scrollHeight, el.scrollWidth);
  }, [embedded, matches, apiError, loading, attemptedSubmit]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleInvestmentType(type: InvestmentType) {
    setForm((prev) => {
      const next = prev.investmentTypes.includes(type)
        ? prev.investmentTypes.filter((t) => t !== type)
        : [...prev.investmentTypes, type];
      return { ...prev, investmentTypes: next };
    });
  }

  async function handleSubmit() {
    setAttemptedSubmit(true);
    if (!isValid(form)) return;
    const profile = toProfile(form);

    setLoading(true);
    setApiError(null);
    setMatches(null);
    try {
      const result = await fetchImpl(profile);
      setMatches(result);
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const showError = (field: keyof FormErrors): string | undefined =>
    attemptedSubmit ? errors[field] : undefined;

  return (
    <div className={embedded ? "page page-embedded" : "page"} ref={rootRef}>
      {!embedded && <h1>Find an advisor</h1>}
      <div role="group" aria-label="advisor profile">
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
          {showError("name") && (
            <p className="error" role="alert">
              {showError("name")}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="location">Location</label>
          <select
            id="location"
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
          >
            <option value="">Select a city…</option>
            {LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
          {showError("location") && (
            <p className="error" role="alert">
              {showError("location")}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="budget">Investable budget ($, minimum 100)</label>
          <input
            id="budget"
            type="number"
            min={100}
            value={form.budget}
            onChange={(e) => update("budget", e.target.value)}
          />
          {showError("budget") && (
            <p className="error" role="alert">
              {showError("budget")}
            </p>
          )}
        </div>

        <fieldset className="field">
          <legend>Investment types</legend>
          {INVESTMENT_TYPES.map((type) => (
            <label key={type} className="checkbox-label">
              <input
                type="checkbox"
                checked={form.investmentTypes.includes(type)}
                onChange={() => toggleInvestmentType(type)}
              />
              {INVESTMENT_TYPE_LABELS[type]}
            </label>
          ))}
          {showError("investmentTypes") && (
            <p className="error" role="alert">
              {showError("investmentTypes")}
            </p>
          )}
        </fieldset>

        <div className="field">
          <label htmlFor="riskLevel">Risk level</label>
          <select
            id="riskLevel"
            value={form.riskLevel}
            onChange={(e) => update("riskLevel", e.target.value)}
          >
            <option value="">Select risk level…</option>
            {RISK_LEVELS.map((risk) => (
              <option key={risk} value={risk}>
                {RISK_LEVEL_LABELS[risk]}
              </option>
            ))}
          </select>
          {showError("riskLevel") && (
            <p className="error" role="alert">
              {showError("riskLevel")}
            </p>
          )}
        </div>

        <div className="submit-row">
          <button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={!canSubmit}
          >
            {loading ? "Searching…" : "Find Advisor"}
          </button>
        </div>
      </div>

      {loading && <p className="loading">Looking for matches…</p>}

      {apiError && (
        <div className="api-error" role="alert">
          <p>Something went wrong: {apiError}</p>
          <button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
          >
            Try again
          </button>
        </div>
      )}

      {matches && <ResultsList matches={matches} />}
    </div>
  );
}

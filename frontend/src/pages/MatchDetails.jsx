import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, LoaderCircle, ShieldCheck, AlertCircle } from "lucide-react";
import { getMyMatches, startClaim, submitClaimAnswers } from "../services/api";
import "../styles/pages.css";

export default function MatchDetails() {
  const { matchId } = useParams();
  const [match, setMatch] = useState(null);
  const [claim, setClaim] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    getMyMatches().then((matches) => {
      const selected = matches.find((entry) => String(entry.id) === decodeURIComponent(matchId));
      if (!selected) throw new Error("This possible match is no longer available.");
      if (active) setMatch(selected);
    }).catch((err) => { if (active) setError(err.message || "Unable to load match status."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [matchId]);
  async function begin() {
    setBusy(true); setError("");
    try { const value = await startClaim(match.id); setClaim(value); setAnswers(value.questions.map(() => "")); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function submit() {
    setBusy(true); setNotice("");
    try {
      const result = await submitClaimAnswers(claim.id, answers);
      setClaim((current) => ({ ...current, status: result.status, contactEnabled: result.contactEnabled }));
      setNotice(result.contactEnabled ? "Ownership verified. The permitted connection workflow is now available." : result.status === "review_required" ? "The attempt limit was reached. This claim is queued for Super Admin review." : `Answers submitted. ${result.attemptsRemaining} attempt(s) remain.`);
    } catch (err) { setNotice(err.message); }
    finally { setBusy(false); }
  }
  return <div className="page-container match-details-page">
    <Link to="/matches" className="back-link"><ArrowLeft size={17} /> Back to Matches</Link>
    {loading ? <div className="empty-state"><LoaderCircle size={30} /><h3>Loading status...</h3></div> : error && !match ? <div className="empty-state" role="alert"><AlertCircle size={30} /><h3>Match status unavailable</h3><p>{error}</p></div> : <>
      <div className="page-heading"><span className="eyebrow">PRIVATE MATCH INDICATION</span><h1>A found report may match your item</h1><p>{match?.lostReport?.title || "Your lost report"}</p></div>
      <div className="ai-info-banner"><div className="ai-banner-icon"><ShieldCheck size={22} /></div><div><h3>Found details are protected</h3><p>The found report’s description, image, and finder identity remain private. Contact is enabled only after successful ownership verification.</p></div></div>
      {error && <p role="alert">{error}</p>}
      {!claim ? <button className="button button-primary" onClick={begin} disabled={busy}>{busy ? "Loading questions…" : "Start ownership verification"}</button> : <section className="content-panel"><h2>Ownership questions</h2><p>Answers are checked together. Individual answer results are not shown.</p>{claim.questions.map((question, index) => <label className="form-field" key={index}><span>{question.prompt}</span><input value={answers[index] || ""} onChange={(event) => setAnswers((current) => current.map((answer, i) => i === index ? event.target.value : answer))} disabled={["verified", "review_required"].includes(claim.status)} /></label>)}<button className="button button-primary" onClick={submit} disabled={busy || ["verified", "review_required"].includes(claim.status)}>{busy ? "Checking…" : "Submit answers"}</button>{notice && <p role="status">{notice}</p>}</section>}
    </>}
  </div>;
}

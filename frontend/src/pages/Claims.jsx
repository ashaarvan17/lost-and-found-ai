import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Clock3, CheckCircle2, AlertCircle, Send } from "lucide-react";
import { getMyClaims, getClaimMessages, sendClaimMessage, reportClaimIssue, submitReviewInformation, getRecoveryTransactions, createPersonalHandover, createCollection, generateRecoveryOtp, validateRecoveryOtp } from "../services/api";
import "../styles/pages.css";

const labels = { questions_issued: "Questions issued", verification_failed: "Verification incomplete", verified: "Verified", review_required: "Admin review", review_info_requested: "Information requested", issue_reported: "Issue reported", escalated: "Escalated", rejected: "Rejected", closed: "Closed", cancelled: "Cancelled", suspended: "Suspended" };
function StatusIcon({ status }) { const Icon = status === "verified" ? CheckCircle2 : ["review_required", "issue_reported", "escalated", "rejected"].includes(status) ? AlertCircle : Clock3; return <Icon size={14} />; }

function Conversation({ claim }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { getClaimMessages(claim.id).then(setMessages).catch((err) => setError(err.message)); }, [claim.id]);
  async function send(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { const message = await sendClaimMessage(claim.id, body); setMessages((current) => [...current, message]); setBody(""); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="content-panel" aria-label="Private claim conversation"><h3>Private conversation</h3><p>Messages are limited to the verified claimant and finder for this claim. Contact details are not added automatically.</p><div className="claim-message-list">{messages.map((message) => <article className="claim-message" key={message.id}><small>{message.senderId === claim.viewerId ? "You" : "Other participant"} · {new Date(message.createdAt).toLocaleString()}</small><p>{message.body}</p></article>)}{messages.length === 0 && <p>No messages yet.</p>}</div>{error && <p role="alert">{error}</p>}<form onSubmit={send}><label className="form-field"><span>Message</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} required rows={3} /></label><button className="button button-primary" disabled={busy || !body.trim()}><Send size={15} /> {busy ? "Sending…" : "Send message"}</button></form></section>;
}

function Recovery({ claim }) {
  const [transactions, setTransactions] = useState([]); const [error, setError] = useState(""); const [otp, setOtp] = useState(""); const [code, setCode] = useState("");
  async function reload() { try { setTransactions(await getRecoveryTransactions(claim.id)); } catch (err) { setError(err.message); } }
  useEffect(() => {
    let active = true;
    getRecoveryTransactions(claim.id).then((rows) => { if (active) setTransactions(rows); }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [claim.id]);
  async function create(kind) { try { setError(""); const tx = kind === "personal_handover" ? await createPersonalHandover(claim.id) : await createCollection(claim.id); setTransactions((rows) => [...rows, tx]); } catch (err) { setError(err.message); } }
  async function issue(tx) { try { const result = await generateRecoveryOtp(tx.id); setOtp(result.otp); await reload(); } catch (err) { setError(err.message); } }
  async function validate(tx) { try { await validateRecoveryOtp(tx.id, code); setCode(""); setOtp(""); setError(""); await reload(); } catch (err) { setError(err.message); } }
  return <section className="content-panel"><h3>Item recovery</h3><p>Recovery steps are authorized and recorded by the server. OTPs are shown once to the authorized issuer.</p>{claim.participantRole === "claimant" && <><button className="button button-secondary" type="button" onClick={() => create("personal_handover")}>Start personal handover</button> <button className="button button-secondary" type="button" onClick={() => create("collection")}>Start Local Admin collection</button></>}{error && <p role="alert">{error}</p>}{otp && <p role="status"><strong>Share this one-time code with the authorized receiver:</strong> {otp}</p>}{transactions.map((tx) => <article className="claim-message" key={tx.id}><p>{tx.purpose.replaceAll("_", " ")} · {tx.status}</p>{claim.viewerId === tx.claimantId && tx.status !== "completed" && <button type="button" className="button button-secondary" onClick={() => issue(tx)}>Generate OTP</button>}{claim.viewerId === tx.finderId && tx.purpose === "personal_handover" && tx.status === "otp_issued" && <div><input aria-label="Handover OTP" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /><button type="button" className="button button-primary" onClick={() => validate(tx)}>Validate handover OTP</button></div>}</article>)}</section>;
}

export default function Claims() {
  const [claims, setClaims] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [issueDrafts, setIssueDrafts] = useState({});
  const [informationDrafts, setInformationDrafts] = useState({});
  async function reload() { setLoading(true); try { setClaims(await getMyClaims()); setError(""); } catch (err) { setError(err.message); } finally { setLoading(false); } }
  useEffect(() => {
    let active = true;
    getMyClaims().then((rows) => { if (active) { setClaims(rows); setError(""); } }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function reportIssue(claim) {
    try { await reportClaimIssue(claim.id, issueDrafts[claim.id] || ""); setIssueDrafts((current) => ({ ...current, [claim.id]: "" })); await reload(); }
    catch (err) { setError(err.message); }
  }
  async function submitInformation(claim) {
    try { await submitReviewInformation(claim.id, informationDrafts[claim.id] || ""); setInformationDrafts((current) => ({ ...current, [claim.id]: "" })); await reload(); }
    catch (err) { setError(err.message); }
  }
  return <div className="page-container"><div className="page-heading-row"><div><span className="eyebrow">OWNERSHIP VERIFICATION</span><h1>My Claims</h1><p>Track verification and communicate privately after verification.</p></div></div>
    <div className="ai-info-banner"><div className="ai-banner-icon"><ShieldCheck size={22} /></div><div><h3>Private, claim-scoped communication</h3><p>Messages open only after backend verification and remain limited to the claimant and finder associated with that claim.</p></div></div>
    {loading ? <p>Loading claims…</p> : error && claims.length === 0 ? <p role="alert">{error}</p> : claims.length === 0 ? <div className="empty-state"><h3>No claims yet</h3><p>Open a possible match to begin ownership verification.</p><Link to="/matches">View matches</Link></div> : <div className="claims-list">{claims.map((claim) => <article className="claim-card" key={claim.id}><div className="claim-card-top"><div className="claim-icon"><ShieldCheck size={22} /></div><span className={`claim-status claim-status-${claim.status}`}><StatusIcon status={claim.status} />{labels[claim.status] || claim.status}</span></div><h3>{claim.valueTier} value tier · {claim.participantRole}</h3><p>{claim.status === "verified" ? `Ownership verified. You can now communicate privately with the ${claim.participantRole === "claimant" ? "finder" : "claimant"}.` : ["review_required", "issue_reported", "escalated"].includes(claim.status) ? "This claim is awaiting Super Admin review." : ["rejected", "closed", "cancelled", "suspended"].includes(claim.status) ? "Communication is unavailable for this claim." : claim.status === "review_info_requested" ? "Super Admin requested more information." : `${claim.attemptsRemaining} attempt(s) remain.`}</p><div className="claim-card-footer"><span>Attempts used: {claim.attemptCount}</span>{claim.lockedUntil && <span>Lockout until {new Date(claim.lockedUntil).toLocaleString()}</span>}</div>{claim.requestInformation && <div className="content-panel"><h3>Information requested by Super Admin</h3><p>{claim.requestInformation}</p><label className="form-field"><span>Your response</span><textarea value={informationDrafts[claim.id] || ""} onChange={(event) => setInformationDrafts((current) => ({ ...current, [claim.id]: event.target.value }))} maxLength={2000} rows={3} /></label><button className="button button-primary" type="button" onClick={() => submitInformation(claim)}>Submit information</button></div>}{claim.status === "verified" && <><Conversation claim={claim} /><Recovery claim={claim} /></>}{!["rejected", "closed", "cancelled", "suspended"].includes(claim.status) && <div className="content-panel"><label className="form-field"><span>Report an issue with this claim</span><textarea value={issueDrafts[claim.id] || ""} onChange={(event) => setIssueDrafts((current) => ({ ...current, [claim.id]: event.target.value }))} maxLength={2000} rows={2} /></label><button className="button button-secondary" type="button" onClick={() => reportIssue(claim)}>Report issue</button></div>}</article>)}</div>}
    <div className="claims-help"><p>Looking for a possible match?</p><Link to="/matches">View matches</Link></div>
  </div>;
}

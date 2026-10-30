import { Link } from "react-router-dom";
import {
  ShieldCheck,
  Clock3,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import "../styles/pages.css";

const demoClaims = [
  {
    id: 1,
    item: "Black Leather Wallet",
    submitted: "Oct 27, 2026",
    status: "Pending",
    description: "Your claim is awaiting review.",
  },
  {
    id: 2,
    item: "Wireless Earbuds",
    submitted: "Oct 24, 2026",
    status: "Under Review",
    description: "The claim is being checked by an administrator.",
  },
];

function getStatusIcon(status) {
  if (status === "Approved") return CheckCircle2;
  if (status === "Rejected") return AlertCircle;
  return Clock3;
}

export default function Claims() {
  return (
    <div className="page-container">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">OWNERSHIP VERIFICATION</span>
          <h1>My Claims</h1>
          <p>Track requests you have submitted to reclaim items.</p>
        </div>
      </div>

      <div className="ai-info-banner">
        <div className="ai-banner-icon"><ShieldCheck size={22} /></div>
        <div>
          <h3>Protecting rightful ownership</h3>
          <p>
            A potential AI match does not establish ownership. Claims may
            require additional details or administrator verification.
          </p>
        </div>
      </div>

      <div className="claims-list">
        {demoClaims.map((claim) => {
          const StatusIcon = getStatusIcon(claim.status);

          return (
            <article className="claim-card" key={claim.id}>
              <div className="claim-card-top">
                <div className="claim-icon"><ShieldCheck size={22} /></div>

                <span
                  className={`claim-status claim-status-${claim.status
                    .toLowerCase()
                    .replaceAll(" ", "-")}`}
                >
                  <StatusIcon size={14} />
                  {claim.status}
                </span>
              </div>

              <h3>{claim.item}</h3>
              <p>{claim.description}</p>

              <div className="claim-card-footer">
                <span>Submitted: {claim.submitted}</span>
                <span>Claim #{claim.id}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="claims-help">
        <p>Don't see a claim you submitted?</p>
        <Link to="/browse">Browse reported items</Link>
      </div>

      <p className="demo-notice">
        Sample claims are shown here. Actual claim status will come from the
        database when the claims API is connected.
      </p>
    </div>
  );
}
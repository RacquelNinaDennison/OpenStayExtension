import { Link } from "react-router-dom";

export default function GetStarted() {
  return (
    <div className="container" style={{padding: "28px 0"}}>
      <div className="card" style={{borderRadius: 20, padding: 24}}>
        <h2 style={{margin: 0}}>Getting started</h2>
        <p className="muted" style={{marginTop: 6}}>
          A quick overview of how OpenStay’s escrow flow works.
        </p>

        <ol style={{marginTop: 12, lineHeight: 1.8}}>
          <li>Connect your Phantom wallet.</li>
          <li>Browse <Link to="/listings">Listings</Link> and pick a place.</li>
          <li>On checkout, funds are held in a timelocked USDC escrow.</li>
          <li>After checkout time, go to <Link to="/dashboard">Your Escrows</Link> and release.</li>
        </ol>

        <div style={{display:"flex", gap:12, marginTop:16}}>
          <Link to="/listings" className="btn btn-primary">Browse listings</Link>
          <Link to="/dashboard" className="btn btn-secondary">Your escrows</Link>
        </div>
      </div>
    </div>
  );
}

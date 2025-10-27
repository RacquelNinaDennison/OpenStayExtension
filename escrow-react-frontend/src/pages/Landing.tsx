import { Link } from "react-router-dom";
import "./landing.css";

export default function Landing() {
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-wrap container">
          <div className="hero-copy">
            <p className="eyebrow">Best reservations, on-chain</p>
            <h1 className="hero-title">
              Travel, enjoy and book with <span className="grad">timelocked escrow</span>
            </h1>
            <p className="hero-sub">
              Hold funds safely in USDC. Hosts get paid automatically after your
              stay—or you can release with one click.
            </p>
            <div className="hero-cta">
              <Link to="/listings" className="btn btn-primary btn-lg">Explore stays</Link>
              <a href="#how" className="btn btn-secondary btn-lg">How it works</a>
            </div>
          </div>

          <div className="hero-art">
            <div className="blob" />
            <img
              className="hero-img"
              alt="traveler"
              src="https://images.unsplash.com/photo-1526779259212-939e64788e3c?q=80&w=1200&auto=format&fit=crop"
            />
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="features container">
        <h2 className="section-title">We Offer Best Services</h2>
        <div className="feature-grid">
          <Feature
            icon="🌤️"
            title="Calculated Weather"
            text="Pick the right dates with integrated forecasts."
          />
          <Feature
            icon="✈️"
            title="Best Flights"
            text="Curated routes next to your stay (coming soon)."
          />
          <Feature
            icon="🎟️"
            title="Local Events"
            text="Find happenings near your listing."
          />
          <Feature
            icon="⚙️"
            title="Customization"
            text="Flexible cancellation & timelock windows."
          />
        </div>
      </section>

      <section className="destinations container">
        <h3 className="section-sub">Top Destinations</h3>
        <div className="card-row">
          {[
            { t: "Lisbon", img: "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?q=80&w=1600&auto=format&fit=crop" },
            { t: "Tokyo", img: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=1600&auto=format&fit=crop" },
            { t: "NYC", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Lights_of_Rockefeller_Center_during_sunset.jpg/1200px-Lights_of_Rockefeller_Center_during_sunset.jpg" },
            { t: "Bali", img: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2a/c7/90/94/caption.jpg?w=1400&h=1400&s=1" },
          ].map((d) => (
            <Link to="/listings" key={d.t} className="dest-card">
              <img src={d.img} alt={d.t} />
              <div className="dest-meta">
                <div className="dest-title">{d.t}</div>
                <div className="dest-pill">View stays →</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="how container">
        <div className="how-head">
          <h2 className="section-title">Book Your Next Trip in 3 Easy Steps</h2>
          <p className="how-sub">Escrow-backed bookings keep everyone safe.</p>
        </div>
        <div className="how-grid">
          <Step n={1} title="Browse stays" text="Pick a place you love. Transparent prices, no surprises." />
          <Step n={2} title="Hold funds" text="USDC is locked in escrow until checkout time." />
          <Step n={3} title="Release" text="Funds auto-release after your stay—or at any time by you." />
        </div>
        <div className="how-cta">
          <Link to="/listings" className="btn btn-primary btn-lg">Start exploring</Link>
          <Link to="/get-started" className="btn btn-ghost btn-lg">Learn more</Link>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="subscribe">
        <div className="container sub-wrap">
          <h3>Be the first to know</h3>
          <p>Get product updates, new cities, and exclusive deals.</p>
          <form
            className="sub-form"
            onSubmit={(e) => { e.preventDefault(); alert("Thanks!"); }}
          >
            <input placeholder="you@email.com" />
            <button className="btn btn-accent">Subscribe</button>
          </form>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, title, text }: any) {
  return (
    <div className="feature">
      <div className="fi">{icon}</div>
      <div className="ft">
        <div className="ft-title">{title}</div>
        <div className="ft-sub">{text}</div>
      </div>
    </div>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="step">
      <div className="step-number">{n}</div>
      <div className="step-title">{title}</div>
      <div className="step-text">{text}</div>
    </div>
  );
}

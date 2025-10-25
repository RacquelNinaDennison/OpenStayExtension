import { useParams, Link } from "react-router-dom";
import { LISTINGS } from "../data/listings";

export default function ListingDetail() {
  const { id } = useParams();
  const l = LISTINGS.find((x) => x.id === id);
  if (!l) return <div className="card pad-lg">Listing not found</div>;

  return (
    <div className="card main-card">
      {/* Collage header (Airbnb-like) */}
      <div className="collage">
        <img src={l.image} alt={l.title} />
        <div className="right">
          <img src={l.image} alt="" />
          <img src={l.image} alt="" />
        </div>
      </div>

      <div className="section" style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:24}}>
        <div className="card pad-lg">
          <h2 className="h2" style={{marginBottom:6}}>{l.title}</h2>
          <div className="mute" style={{marginBottom:14}}>{l.location}</div>

          <div className="kv" style={{marginTop:6}}>
            <strong>Price</strong>
            <span>${l.pricePerNight}/night</span>
          </div>
          <p className="mute" style={{marginTop:12}}>{l.description}</p>
        </div>

        <div className="sticky-book">
          <div className="kv" style={{marginBottom:10}}>
            <strong>From</strong>
            <span>${l.pricePerNight}/night</span>
          </div>
          <Link
            to={`/checkout/${l.id}`}
            className="btn btn-primary"
            style={{textDecoration:"none", width:"100%", display:"inline-block", textAlign:"center"}}
          >
            Book this stay
          </Link>
        </div>
      </div>
    </div>
  );
}

import { LISTINGS } from "../data/listings";
import { Link } from "react-router-dom";

export default function Listings() {
  return (
    <div className="card main-card">
      <div className="row" style={{marginBottom:8}}>
        <h2 className="h2">Explore stays</h2>
      </div>

      <div className="grid section">
        {LISTINGS.map((l) => (
          <div className="card pad-md" key={l.id}>
            <div className="photo">
              <img src={l.image} alt={l.title} />
              <div className="badge">${l.pricePerNight}/night</div>
              <div className="heart">♡</div>
            </div>

            <h3 style={{margin:"12px 2px 6px"}}>{l.title}</h3>
            <div className="mute" style={{margin:"0 2px 6px"}}>{l.location}</div>
            <p className="mute" style={{margin:"0 2px 4px"}}>{l.description}</p>

            <div className="row" style={{marginTop:12}}>
              <Link to={`/listing/${l.id}`} className="btn btn-secondary" style={{textDecoration:"none"}}>
                Details
              </Link>
              <Link to={`/checkout/${l.id}`} className="btn btn-primary" style={{textDecoration:"none"}}>
                Book
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

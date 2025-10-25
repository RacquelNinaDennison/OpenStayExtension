import { useParams, Link } from "react-router-dom";
import { LISTINGS } from "../data/listings";

export default function ListingDetail() {
  const { id } = useParams();
  const l = LISTINGS.find(x => x.id === id);
  if (!l) return <div className="card">Listing not found</div>;
  return (
    <div className="card main-card">
      <img className="img" src={l.image} alt={l.title}/>
      <h2 style={{marginTop:12}}>{l.title}</h2>
      <div className="kv"><strong>Location</strong><span>{l.location}</span></div>
      <div className="kv"><strong>Price</strong><span>${l.pricePerNight}/night</span></div>
      <p style={{marginTop:10,color:"#475569"}}>{l.description}</p>
      <Link to={`/checkout/${l.id}`} className="btn btn-primary" style={{textDecoration:"none",marginTop:12,display:"inline-block"}}>Book this stay</Link>
    </div>
  );
}

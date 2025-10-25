export type Listing = {
  id: string;
  title: string;
  location: string;
  pricePerNight: number; // USDC
  hostAddress: string;   // beneficiary pubkey
  image: string;
  description: string;
};

export const LISTINGS: Listing[] = [
  {
    id: "bali-villa",
    title: "Oceanview Villa",
    location: "Uluwatu, Bali",
    pricePerNight: 120,
    hostAddress: "8rq62B1mNRpE67yxHBr4Yi8xJSLuQUDk23difvjXT74e", // put a real pubkey
    image: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?q=80&w=1200",
    description: "Cliffside villa with infinity pool. 2BR • Fast Wi-Fi • Breakfast included."
  },
  {
    id: "paris-loft",
    title: "Sunny Loft",
    location: "Le Marais, Paris",
    pricePerNight: 180,
    hostAddress: "8rq62B1mNRpE67yxHBr4Yi8xJSLuQUDk23difvjXT74e",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=1200",
    description: "Top-floor loft near cafes. 1BR • Balcony • City views."
  },
  {
    id: "tokyo-capsule",
    title: "Modern Studio",
    location: "Shibuya, Tokyo",
    pricePerNight: 95,
    hostAddress: "8rq62B1mNRpE67yxHBr4Yi8xJSLuQUDk23difvjXT74e",
    image: "https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?q=80&w=1200",
    description: "Compact perfection. Next to station. 0BR • 1BA • Quiet lane."
  }
];

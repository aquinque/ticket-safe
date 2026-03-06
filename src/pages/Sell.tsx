import { Navigate } from "react-router-dom";

// Legacy /sell route — redirects to the current marketplace sell page.
// The old page used a mock QR verification library (not connected to the DB).
export default function Sell() {
  return <Navigate to="/marketplace/sell" replace />;
}

import { Navigate, useLocation } from "react-router-dom";

// Legacy /sell route — forwards to the current marketplace sell page,
// preserving any query string (e.g. ?studio_ticket=…).
export default function Sell() {
  const { search } = useLocation();
  return <Navigate to={`/marketplace/sell${search}`} replace />;
}

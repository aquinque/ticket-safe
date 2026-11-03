import { AdminEventsView, type AdminData, type AdminEvent, type AdminOrder, type Attendee } from "./AdminEvents";

/**
 * The admin events page with sample numbers, to check the layout without an admin account.
 * Development builds only (see App.tsx); nothing here reads the database.
 */

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

function sample(id: string, title: string, org: [string, string], days: number, price: number, fee: number, sold: number, capacity: number, came: number, salesFrom: number): { event: AdminEvent; orders: AdminOrder[] } {
  // Sales spread over the weeks before the event, 1 to 3 tickets per order.
  const orders: AdminOrder[] = [];
  for (let left = sold, i = 0; left > 0; i++) {
    const q = Math.min(left, 1 + (i % 3));
    orders.push({ event_id: id, created_at: at(salesFrom + ((i * 7) % Math.max(1, days - salesFrom))), quantity: q, paidCents: q * (price + fee), feeCents: q * fee, tier_id: `${id}-t` });
    left -= q;
  }
  return {
    event: {
      id, title, date: at(days), ends_at: null, location: "Madrid", status: "published", slug: null, currency: "EUR",
      organizer: { id: org[0], name: org[1], email: "organizer@example.com" },
      capacity, sold, checkedIn: came, orders: orders.length,
      paidCents: sold * (price + fee), feeCents: sold * fee, organizerCents: sold * price,
      tiers: [{ id: `${id}-t`, name: "Regular", price_cents: price, sold, total: capacity }],
    },
    orders,
  };
}

const ALL = [
  sample("d1", "Winter Kick-off · Ayala 120", ["o1", "Demo Society"], 9, 1300, 132, 100, 150, 0, -20),
  sample("d2", "Business Gala", ["o2", "Sample Student Union"], -12, 2500, 180, 240, 250, 221, -60),
  sample("d3", "Erasmus Welcome Party", ["o1", "Demo Society"], -45, 800, 102, 180, 200, 164, -90),
];
// A few events without sales, which the Events tab hides until asked.
const EMPTY = [sample("d4", "Draft Afterwork", ["o1", "Demo Society"], 20, 1000, 120, 0, 80, 0, -5), sample("d5", "Sunset Rooftop", ["o2", "Sample Student Union"], 30, 1500, 140, 0, 120, 0, -5)];
const DATA: AdminData = {
  events: [...ALL, ...EMPTY].map((s) => s.event),
  orders: ALL.flatMap((s) => s.orders),
  scans: ALL.flatMap((s) => Array.from({ length: s.event.checkedIn }, () => ({ event_id: s.event.id, at: s.event.date }))),
};

const people = (n: number): Attendee[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, first_name: "Sample", last_name: `Person ${i + 1}`, email: `sample${i + 1}@example.com`, buyer_email: i % 5 === 1 ? "friend@example.com" : null,
    gender: ["female", "male", "female", "other"][i % 4], tier: "Regular", status: "valid", scanned_at: i % 4 === 0 ? at(-1) : null, bought_at: at(-5 - i),
  }));

const AdminEventsDemo = () => (
  <AdminEventsView
    data={DATA}
    error={null}
    updated={new Date()}
    onRefresh={() => {}}
    loadPeople={async () => people(12)}
    searchPeople={async (q) => people(12).filter((p) => `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(q.toLowerCase())).map((p) => ({ ...p, event_id: "d2" }))}
    banner={<p className="mb-4 border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm">Demo: sample numbers on this computer only. The real page is /admin/events.</p>}
  />
);

export default AdminEventsDemo;

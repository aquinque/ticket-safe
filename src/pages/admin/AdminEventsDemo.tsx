import { AdminEventsView, type AdminEvent, type Attendee } from "./AdminEvents";

/**
 * The admin events page with sample numbers, to check the layout without an admin account.
 * Development builds only (see App.tsx); nothing here reads the database.
 */

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

function sample(id: string, title: string, org: string, days: number, price: number, sold: number, capacity: number, came: number, fee: number): AdminEvent {
  return {
    id, title, date: at(days), ends_at: null, location: "Madrid", status: "published", slug: null, currency: "EUR",
    organizer: { name: org, email: "organizer@example.com" },
    capacity, sold, checkedIn: came, orders: Math.round(sold * 0.8),
    paidCents: sold * (price + fee), feeCents: sold * fee, organizerCents: sold * price,
    tiers: [{ name: "Regular", price_cents: price, sold, total: capacity }],
  };
}

const EVENTS: AdminEvent[] = [
  sample("d1", "Winter Kick-off · Ayala 120", "Demo Society", 9, 1300, 100, 150, 0, 132),
  sample("d2", "Business Gala", "Sample Student Union", -12, 2500, 240, 250, 221, 180),
  sample("d3", "Erasmus Welcome Party", "Demo Society", -30, 800, 180, 200, 164, 102),
];

const people = (n: number): Attendee[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, first_name: "Sample", last_name: `Person ${i + 1}`, email: `sample${i + 1}@example.com`, buyer_email: null,
    gender: ["female", "male", "other"][i % 3], tier: "Regular", status: "valid", scanned_at: i % 4 === 0 ? at(-1) : null, bought_at: at(-5),
  }));

const AdminEventsDemo = () => (
  <AdminEventsView
    events={EVENTS}
    error={null}
    updated={new Date()}
    onRefresh={() => {}}
    loadPeople={async () => people(12)}
    banner={<p className="mb-4 border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm">Demo: sample numbers on this computer only. The real page is /admin/events.</p>}
  />
);

export default AdminEventsDemo;

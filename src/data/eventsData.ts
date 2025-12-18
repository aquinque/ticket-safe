import galaBanner from "@/assets/events/gala-banner.jpg";

export interface EventData {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  time: string;
  endTime?: string;
  location: string;
  organizer: string;
  description: string;
  category: string;
  filterCategory: string;
  image: string;
  isPastEvent: boolean;
}

export const eventsList: EventData[] = [
  {
    id: "turin-gala-2026",
    title: "Turin Campus Gala 2026",
    date: "2026-03-27",
    time: "20:00",
    endTime: "23:55",
    location: "Location TBA",
    organizer: "Turin Campus",
    description: "We are glad to invite you to the 2026 Turin Gran Gala. The Gala is the perfect time to celebrate the ESCP's successes over the past year and is the biggest event on the Turin Campus' social calendar!",
    category: "Gala",
    filterCategory: "galas",
    image: galaBanner,
    isPastEvent: false
  }
];

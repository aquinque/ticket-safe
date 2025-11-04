import partyBanner from "@/assets/events/party-banner.jpg";
import galaBanner from "@/assets/events/gala-banner.jpg";
import conferenceBanner from "@/assets/events/conference-banner.jpg";
import sustainabilityBanner from "@/assets/events/sustainability-banner.jpg";
import ceremonyBanner from "@/assets/events/ceremony-banner.jpg";
import skiBanner from "@/assets/events/ski-banner.jpg";
import sportsBanner from "@/assets/events/sports-banner.jpg";
import talentBanner from "@/assets/events/talent-banner.jpg";

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
    id: "clothing-swap-2025",
    title: "Clothing Swap Party",
    date: "2025-11-05",
    time: "17:00",
    endTime: "19:30",
    location: "Room 115 (Student Society Room) - ESCP Turin Campus",
    organizer: "GEA Sustainability",
    description: "Join us for the Clothing Swap Party! Let's make fashion circular: bring the clothes you no longer wear and exchange them for something new.",
    category: "Sustainability",
    filterCategory: "sustainability",
    image: sustainabilityBanner,
    isPastEvent: false
  },
  {
    id: "ebs-halloween-2025",
    title: "EBS Halloween Party",
    date: "2025-11-06",
    time: "23:00",
    endDate: "2025-11-07",
    endTime: "05:00",
    location: "Location shared after purchase",
    organizer: "EBS",
    description: "The EBS Halloween Party is a thrilling night full of costumes, music, and spooky vibes! Join fellow students for an unforgettable evening with decorations, a costume contest, and a dance floor that keeps the energy high all night long.",
    category: "Party",
    filterCategory: "parties",
    image: partyBanner,
    isPastEvent: false
  },
  {
    id: "spf-talent-show-2025",
    title: "SPF Talent Show",
    date: "2025-11-11",
    time: "17:00",
    endTime: "20:00",
    location: "ESCP Auditorium",
    organizer: "SPF",
    description: "A Night to Shine for a Cause! Get ready for an unforgettable evening where ESCP's brightest stars take the stage! From music and comedy to dance, and magic – come celebrate creativity, laughter, and talent while supporting a great cause.",
    category: "Talent Show",
    filterCategory: "other",
    image: talentBanner,
    isPastEvent: false
  },
  {
    id: "opening-ceremony-2025",
    title: "Opening Ceremony - AY 2025-2026",
    date: "2025-11-13",
    time: "10:30",
    endTime: "14:00",
    location: "ESCP Turin",
    organizer: "Turin Campus",
    description: "Join us for the Opening Ceremony of the 2025–26 Academic Year at ESCP Turin Campus.",
    category: "Ceremony",
    filterCategory: "other",
    image: ceremonyBanner,
    isPastEvent: false
  },
  {
    id: "empowering-voices-2025",
    title: "Empowering Voices: Women, Inclusion, and Leadership",
    date: "2025-11-25",
    time: "17:00",
    endTime: "18:00",
    location: "ESCP Turin",
    organizer: "Girl Up",
    description: "On the International Day for the Elimination of Violence Against Women, we open a conversation about empowerment, equity, and safety in the workplace. Explore how at Bain & Company inclusion and diversity go beyond recruitment.",
    category: "Conference",
    filterCategory: "conferences",
    image: conferenceBanner,
    isPastEvent: false
  },
  {
    id: "ebs-ski-trip-2025",
    title: "EBS Ski Trip - Season 4",
    date: "2025-12-13",
    endDate: "2025-12-20",
    time: "12:00",
    location: "Alps (exact location TBA)",
    organizer: "EBS",
    description: "The Ski Trip 2025 – Season 4 is a student-only trip. A week of skiing, fun, and unforgettable student nights!",
    category: "Ski Trip",
    filterCategory: "sports",
    image: skiBanner,
    isPastEvent: false
  },
  {
    id: "escp-games-2026",
    title: "ESCP Games",
    date: "2026-03-06",
    endDate: "2026-03-08",
    time: "16:00",
    endTime: "11:00",
    location: "Location TBA",
    organizer: "Madrid Campus",
    description: "The second edition of the ESCP Intercampus Games is here. More information coming soon!",
    category: "Sports Competition",
    filterCategory: "sports",
    image: sportsBanner,
    isPastEvent: false
  },
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

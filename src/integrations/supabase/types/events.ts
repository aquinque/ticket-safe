export interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  location: string;
  category: string;
  university: string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

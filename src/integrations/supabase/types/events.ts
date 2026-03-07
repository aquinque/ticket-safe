export interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  location: string;
  category: string;
  university: string;
  campus: string | null;
  image_url: string | null;
  is_active: boolean;
  base_price: number | null;
  created_at: string;
  updated_at: string;
}

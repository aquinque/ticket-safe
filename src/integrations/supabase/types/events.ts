export interface Event {
  id: string;
  name: string;
  date: string;
  location: string;
  original_price: number;
  image_url: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
}

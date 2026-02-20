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
  /** Platform identifier, e.g. "campusgroups/campuslife.escp.eu" */
  external_source: string | null;
  /** Platform-specific event ID */
  external_event_id: string | null;
  /** TRUE when auto-imported with incomplete data; needs admin review */
  needs_review: boolean;
  created_at: string;
  updated_at: string;
}

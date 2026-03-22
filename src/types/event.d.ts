export interface Event {
  id: number;
  user_id: number;
  type: "Deadline" | "Meeting" | "Business Trip";
  title: string;
  datetime: string;
  status: "upcoming" | "missed" | "completed";
  notified_stages: string[];
  created_at: string;
  updated_at: string;
}

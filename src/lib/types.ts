export type Role = "admin" | "faculty";

export type Person = {
  email: string;
  full_name: string;
  initials: string | null;
  title: string | null;
  role: Role;
  active: boolean;
};

export type Slot = { id: number; starts: string; ends: string; label: string };

export type Room = { id: string; name: string; sort_order: number };

export type SlotStatus = "free" | "class" | "department" | "booked" | "cie" | "event";

export type ScheduleRow = {
  room_id: string;
  room_name: string;
  slot_id: number;
  slot_label: string;
  starts: string;
  ends: string;
  status: SlotStatus;
  subject: string | null;
  faculty_name: string | null;
  reason: string | null;
  is_mine: boolean;
  ended: boolean;
};

export type RequestRow = {
  id: string;
  room_id: string;
  date: string;
  slot_id: number;
  requester_email: string;
  requester_name: string;
  type: "class" | "event";
  description: string;
  pdf_path: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  priority: number;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

export type AllotmentRow = {
  id: number;
  room_id: string;
  date: string;
  slot_id: number;
  kind: "class_request" | "event_request" | "cie" | "event" | "drop" | "restore";
  title: string;
  faculty_email: string | null;
  faculty_name: string | null;
  reason: string;
  request_id: string | null;
  created_by: string;
  created_at: string;
};

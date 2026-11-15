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

export type RoomKind = "classroom" | "lab" | "seminar";

/** Capacity, kind, projector and notes, used to filter free rooms. */
export type Room = { id: string; name: string; sort_order: number; capacity?: number | null; kind?: RoomKind; projector?: boolean; notes?: string; archived?: boolean };

export type SlotStatus = "free" | "class" | "department" | "booked" | "cie" | "event" | "closed";

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
  /** The regular class a booking, CIE or event took the place of */
  original_subject?: string | null;
  original_faculty?: string | null;
};

export type RequestRow = {
  id: string;
  room_id: string;
  date: string;
  slot_id: number;
  requester_email: string;
  requester_name: string;
  type: "class" | "event";
  subject: string | null; // the allotted subject a class is for
  description: string;
  pdf_path: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  priority: number;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  group_id: string;
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
  /** Initials of the faculty member an admin assigned a class to */
  faculty_initials?: string | null;
  created_by: string;
  created_at: string;
};

/** A slot booked for an event, CIE or approved request, as listed on the home page. */
export type UpcomingRow = Pick<AllotmentRow, "date" | "room_id" | "slot_id" | "kind" | "title" | "faculty_name" | "reason"> & {
  /** The admin who approved the request or allotted the slot */
  approved_by?: string | null;
  /** An admin allotted it directly, with no faculty request */
  allotted?: boolean;
  /** The regular class it took the place of */
  original_subject?: string | null;
  original_faculty?: string | null;
};

/** A request as anyone can see it on a slot: no email, letter or decision note. */
export type PublicRequest = Pick<
  RequestRow,
  "id" | "room_id" | "date" | "slot_id" | "requester_name" | "type" | "subject" | "description" | "status" | "created_at" | "decided_at"
>;

/** All slots of one (possibly multi-slot) request. */
export type RequestGroup = {
  group_id: string;
  rows: RequestRow[];
  first: RequestRow;
  slotIds: number[];
  range: string; // e.g. "8:00 AM – 9:50 AM"
};

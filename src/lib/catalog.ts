// What the developer platform offers, in one place: the server enforces it, and the portal, the
// API playground and the docs render it. No server-only imports, so the browser can use it too.

export const SCOPES = {
  "user:read": "See your name and email address",
  "meeting:read": "See your meetings, their settings and attendance reports",
  "meeting:write": "Schedule, change, delete and end your meetings",
  "participant:read": "See who is in your meetings and in their waiting rooms, live",
  "chat:write": "Post messages into the chat of your live meetings",
} as const;
export type Scope = keyof typeof SCOPES;
export const isScope = (s: string): s is Scope => s in SCOPES;

export const EVENTS = {
  "meeting.created": { scope: "meeting:read", text: "A meeting was scheduled or started" },
  "meeting.updated": { scope: "meeting:read", text: "A meeting's topic, time or settings changed" },
  "meeting.deleted": { scope: "meeting:read", text: "A scheduled meeting was deleted" },
  "meeting.started": { scope: "meeting:read", text: "The first participant joined" },
  "meeting.ended": { scope: "meeting:read", text: "The host ended the meeting for everyone" },
  "participant.joined": { scope: "participant:read", text: "Someone joined, or was admitted from the waiting room" },
  "participant.left": { scope: "participant:read", text: "Someone left or was removed" },
  "participant.waiting": { scope: "participant:read", text: "Someone is waiting to be admitted" },
} as const satisfies Record<string, { scope: Scope; text: string }>;
export type EventName = keyof typeof EVENTS;

const MEETING = {
  id: "kfa-wqpz-tnu",
  topic: "Weekly design review",
  agenda: "Walk through the new onboarding flow.",
  status: "waiting",
  start_time: "2026-11-02T15:00:00.000Z",
  duration: 45,
  created_at: "2026-10-25T09:12:44.000Z",
  started_at: null,
  ended_at: null,
  join_url: "https://convene-meet.netlify.app/m/kfa-wqpz-tnu",
  settings: { waiting_room: true, locked: false },
};

export type Endpoint = {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  scope: Scope;
  title: string;
  text: string;
  body?: Record<string, unknown>;
  query?: string;
  response?: unknown;
  status?: number;
};

export const ENDPOINTS: Endpoint[] = [
  {
    id: "get-me",
    method: "GET",
    path: "/api/v1/users/me",
    scope: "user:read",
    title: "Get the current user",
    text: "The account the access token acts for.",
    response: { id: "4f1c9a7be2d03a18", email: "maya@acme.dev", name: "Maya Chen", createdAt: 1792900000000 },
  },
  {
    id: "list-meetings",
    method: "GET",
    path: "/api/v1/meetings",
    scope: "meeting:read",
    title: "List meetings",
    text: "The account's meetings, newest first. Filter with ?status=upcoming, live or ended.",
    query: "status=upcoming",
    response: { total_records: 1, meetings: [MEETING] },
  },
  {
    id: "create-meeting",
    method: "POST",
    path: "/api/v1/meetings",
    scope: "meeting:write",
    title: "Create a meeting",
    text: "Schedules a meeting, or makes one to start now when start_time is left out. start_url opens it as host on any device; keep it private.",
    body: { topic: "Weekly design review", start_time: "2026-11-02T15:00:00Z", duration: 45, agenda: "Walk through the new onboarding flow.", settings: { waiting_room: true } },
    response: { ...MEETING, host_key: "Qm9i…", start_url: "https://convene-meet.netlify.app/m/kfa-wqpz-tnu#host=Qm9i…" },
    status: 201,
  },
  {
    id: "get-meeting",
    method: "GET",
    path: "/api/v1/meetings/{meetingId}",
    scope: "meeting:read",
    title: "Get a meeting",
    text: "One meeting, with its status: waiting, started or ended.",
    response: MEETING,
  },
  {
    id: "update-meeting",
    method: "PATCH",
    path: "/api/v1/meetings/{meetingId}",
    scope: "meeting:write",
    title: "Update a meeting",
    text: "Change any of topic, agenda, start_time, duration, settings.waiting_room and settings.locked. Changing settings applies to a live meeting at once.",
    body: { topic: "Design review (moved)", start_time: "2026-11-03T16:00:00Z" },
    response: { ...MEETING, topic: "Design review (moved)", start_time: "2026-11-03T16:00:00.000Z" },
  },
  {
    id: "delete-meeting",
    method: "DELETE",
    path: "/api/v1/meetings/{meetingId}",
    scope: "meeting:write",
    title: "Delete a meeting",
    text: "Deletes the meeting and its link. Responds 204, or 409 while people are in it: end it first.",
    status: 204,
  },
  {
    id: "end-meeting",
    method: "POST",
    path: "/api/v1/meetings/{meetingId}/end",
    scope: "meeting:write",
    title: "End a meeting",
    text: "Ends a live meeting for everyone in it, as the host's End button does.",
    response: { ...MEETING, status: "ended", ended_at: "2026-11-02T15:41:09.000Z" },
  },
  {
    id: "list-participants",
    method: "GET",
    path: "/api/v1/meetings/{meetingId}/participants",
    scope: "participant:read",
    title: "List live participants",
    text: "Who is in the meeting right now, and who is in its waiting room.",
    response: {
      meeting_id: "kfa-wqpz-tnu",
      total_records: 2,
      participants: [
        { id: "a1b2c3d4e5f60718", name: "Maya Chen", host: true, joined_at: "2026-11-02T15:00:12.000Z" },
        { id: "0f9e8d7c6b5a4938", name: "Leo Park", host: false, joined_at: "2026-11-02T15:01:40.000Z" },
      ],
      waiting: [{ id: "77aa66bb55cc44dd", name: "Sam Okafor", host: false, joined_at: "2026-11-02T15:03:02.000Z" }],
    },
  },
  {
    id: "report",
    method: "GET",
    path: "/api/v1/meetings/{meetingId}/report",
    scope: "meeting:read",
    title: "Get the attendance report",
    text: "Everyone who was admitted, when they joined and left, and how long they stayed (seconds).",
    response: {
      meeting: { ...MEETING, status: "ended" },
      total_records: 1,
      participants: [{ id: "0f9e8d7c6b5a4938", name: "Leo Park", host: false, joined_at: "2026-11-02T15:01:40.000Z", left_at: "2026-11-02T15:40:02.000Z", duration: 2302, reason: "left" }],
    },
  },
  {
    id: "post-message",
    method: "POST",
    path: "/api/v1/meetings/{meetingId}/messages",
    scope: "chat:write",
    title: "Post a chat message",
    text: "Shows a message in the chat of a live meeting, labelled with your app's name. Responds 409 if nobody is in the meeting.",
    body: { text: "Reminder: 10 minutes left. Notes will be posted in #design." },
    response: { id: "3c9a1f0b2e7d", delivered_to: 4 },
    status: 201,
  },
];

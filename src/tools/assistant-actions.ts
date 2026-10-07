/**
 * Builders for an assistant's `actions` (tools), producing exactly the JSON the
 * QCall app's modals build: AddTransferNumberModal, SimpleBooking +
 * RealTimeBookingModal, WebHookModal.
 */

export interface TransferInput { numbers: string[]; condition: string; say?: string }
export interface BookingInput {
  provider: "openBooking" | "cal.com" | "google_calendar" | "gohighlevel";
  condition: string;
  say?: string;
  timezone?: string;
  start_day_offset?: number;
  booking_days?: string[];
  start_time?: string;
  end_time?: string;
  calcom_api_key?: string;
  calcom_event_id?: string;
  calendar_id?: string;
  slot_minutes?: number;
}
export interface WebhookInput {
  name: string;
  url: string;
  method?: "GET" | "POST";
  on_call_start?: boolean;
  on_call_end?: boolean;
  headers?: Array<{ name: string; value: string }>;
}

const TRANSFER_RETRY = "The person is currently unavailable. Let me connect you with another representative. Please stay on the line.";

export function transferAction(t: TransferInput) {
  return {
    type: "transferCall",
    number: t.numbers.join(","),
    description: t.condition,
    say: t.say ?? "Please hold while I transfer your call.",
    all_unavailable_message: "",
    retry_message: TRANSFER_RETRY,
    ring_timeout_seconds: 40,
    prompt: `If the condition '${t.condition}' is met, initiate the 'transferCall' tool.`,
    transferType: "numbers",
    is_scheduled: false,
    days: "",
    start_time: null,
    end_time: null,
    message: "",
    timezone: ""
  };
}

// SimpleBooking.tsx scheduleMeetingInstructions, provider-hosted calendars (cal.com, GoHighLevel, Google).
function calendarBookingPrompt(condition: string): string {
  const year = new Date().getFullYear();
  return `
          Meeting Scheduling Process:

          1. Initial Inquiry:
              If the condition ${condition} is met, respond with: 'Sure, which date would you like to book the meeting?'

          2. Date Conversion: When the user provides a date, convert it to the 'yyyy-mm-dd' format. For example, if the user says '5th of September,' convert it to '${year}-09-05' (assuming the current year is ${year}).

          3. Validate Date Against Start Date:
              - Call the 'isDateOnOrAfterStartDate' function with the user's preferred date and the startDate to check if the date is valid.
              - The 'startDate' is {startDate}.
              - If the date is invalid, respond to user with: 'Bookings are only available from {startDate} onwards. Please select a date on or after {startDate}.'
              - And if date is valid, proceed to next step 'Ask for Preferred Time'.

          4. Ask for Preferred Time:
              - Ask: 'What time would you like to book the meeting?'
              - If the user provides a specific time:
                  - Call 'getAvailability' with the provided time.
              - If the user says 'anytime,' 'whenever,' or 'I'm flexible':
                  - get user specific date as {startDate}
                  - **Call 'getAvailability' with a generic request to fetch the next available slot.**
                  - **Automatically proceed to Step #5 (Retrieve Available Slots).**

          5. Retrieve Available Slots:
              - If the user provided a specific time:
                  - Call 'getAvailability' with the provided time.
              - If the user says 'anytime':
                  - Call 'getAvailability' with no specific time (or the default working hours).
                  - Get the **earliest available slot**.
                  - Pass this slot to the next step to book the meeting.

          6. Check Slot Availability:
              - If the preferred time matches an available slot, respond with: 'Your preferred slot is available. Would you like me to go ahead and book it, or would you prefer a different time or date?'
              - If not available, provide three closest available slots: 'Sorry, the time you selected isn't available. However, the following slots are open on [Chosen Date]: [Slot 1], [Slot 2], [Slot 3]. Which one would you like to choose?'

          7. Handle Unavailability:
              - If none of the suggested slots work, ask if they would like to try a different date.

          8. Finalize Booking:
              - If the user provided a specific time:
                  - Call 'scheduleMeeting' with their chosen time.
                  - Confirm: 'Your meeting has been successfully booked for [Date] at [Time].'
              - If the user said 'anytime':
                  - Call 'getAvailability' and fetch the **earliest available time**.
                  - Call 'scheduleMeeting' with this slot.
                  - Confirm: 'Your meeting has been booked for the next available slot: [Date] at [Time].'

          9. Cancellations or Rescheduling:
              - Guide them: 'You can modify or cancel your appointment using the link in the email sent to you.'

          10. Escalation:
              - Offer to connect them with a live agent if needed.

          11. Post-Booking Follow-up:
              - Check if the user needs further assistance: 'Is there anything else I can help you with today?'

          12. Handling Duplicate Bookings:
                  - If the meeting or appointment has already been booked, do not call the function tool again for booking. Instead, inform the user about their existing booking.

          13. Booking Status Inquiry:
                  - If the user asks for information about their booking (e.g., whether it's been completed or not), provide them with the current booking status.
      `;
}

// SimpleBooking.tsx scheduleMeetingInstructions for QCall's built-in "openBooking".
function openBookingPrompt(condition: string, start: string, end: string, days: string): string {
  return `
      Meeting Scheduling Process Instructions:

          1.Availability Notification:
                  - If the condition '${condition}' is met, inform the user about the availability for appointments:
                  -Say: 'We have availability for appointments from ${start} to ${end} on the following days: ${days}. Please note that the times are provided in 12-hour format. Let me know which date and time you would like to book an appointment.'

          2.Date Processing:
              Validate Date Against Start Date:
                  - Call the 'isDateOnOrAfterStartDate' function tool with the user's preferred date and the startDate to check if the date is valid.
                  - The 'startDate' is {startDate}.
                  - If the date is invalid, respond with: 'Bookings are only available from {startDate} onwards. Please select a date on or after {startDate}.'
                  - If the date is valid, automatically determine the day of the week for that date.If the day of the week is not within the available booking days, respond with: 'The date you’ve chosen, [day of the week], is not available for booking. Please select a date on a ${days} between ${start} to ${end}.'
                  - If the day of the week and time are within the available booking days and times, so please ask: 'Would you like me to go ahead and book it, or would you prefer a different time or date?'
                  - If the user confirms for booking then, call the 'openBooking' function to book the appointment.

          3.Booking Failure:
                  - If booking fails, ask the user if they would like to be transferred to a live agent. Say: 'It seems there was an issue with your booking. Would you like me to transfer your call to a live agent for further assistance?'

          4.Successful Booking Notification:
                  - After successfully booking the meeting or appointment, notify the user about the booking status and follow up by saying: 'If you need any further information or have any questions, feel free to ask.'

          5.Handling Duplicate Bookings:
                  - If the meeting or appointment has already been booked, do not call the function tool again for booking. Instead, inform the user about their existing booking.

          6.Booking Status Inquiry:
                  - If the user asks for information about their booking (e.g., whether it's been completed or not), provide them with the current booking status.
      `;
}

const DAY_NAMES: Record<string, [string, string]> = {
  monday: ["Monday", "mon"], tuesday: ["Tuesday", "tue"], wednesday: ["Wednesday", "wed"], thursday: ["Thursday", "thu"],
  friday: ["Friday", "fri"], saturday: ["Saturday", "sat"], sunday: ["Sunday", "sun"]
};

/** "09:00 AM" -> "09:00" (google_calendar workingHours use 24h). */
function to24h(time: string): string {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!m) return time;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function bookingAction(b: BookingInput) {
  const days = (b.booking_days ?? ["monday", "tuesday", "wednesday", "thursday", "friday"]).map((d) => DAY_NAMES[d.toLowerCase()]?.[0] ?? d);
  const start = b.start_time ?? "09:00 AM";
  const end = b.end_time ?? "05:00 PM";
  const base = {
    type: "scheduleMeeting",
    meetingType: b.provider,
    timezone: b.provider === "openBooking" ? "" : b.timezone ?? "",
    startDate: String(b.start_day_offset ?? 0),
    description: b.condition,
    say: b.say ?? "Let me check the available slots for you.",
    length: undefined as number | undefined,
    prompt: b.provider === "openBooking" ? openBookingPrompt(b.condition, start, end, days.join(",")) : calendarBookingPrompt(b.condition)
  };
  if (b.provider === "openBooking") return { ...base, startTime: start, endTime: end, bookingDays: days.join(",") };
  if (b.provider === "cal.com") return { ...base, api_key: b.calcom_api_key, eventId: b.calcom_event_id };
  if (b.provider === "gohighlevel") return { ...base, calenderId: b.calendar_id };
  const workingHours = Object.fromEntries(
    days.map((d) => [DAY_NAMES[d.toLowerCase()]?.[1] ?? d.slice(0, 3).toLowerCase(), [[to24h(start), to24h(end)]]])
  );
  return { ...base, calenderId: b.calendar_id, workingHours, slotDuration: b.slot_minutes ?? 30, startTime: start, endTime: end, bookingDays: days.join(",") };
}

export function webhookAction(hooks: WebhookInput[]) {
  return {
    type: "webhook",
    data: hooks.map((w) => ({
      is_call_start: w.on_call_start ?? false,
      is_call_end: w.on_call_end ?? true,
      name: w.name,
      description: `Send call data to ${w.name}`,
      method: w.method ?? "GET",
      url: w.url,
      headers: w.headers ?? [],
      queryParams: [],
      enableBody: false,
      bodyDescription: "",
      bodyProperties: []
    }))
  };
}

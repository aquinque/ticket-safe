/**
 * The end-of-event rule of the whole product (upcoming / live / past), shared with the edge
 * functions: one module, imported from both sides, so the Studio archive, the public catalogue,
 * the checkout and the payout jobs can never disagree on whether an event is over.
 */
export {
  DEFAULT_EVENT_DURATION_HOURS,
  DEFAULT_EVENT_DURATION_MS,
  DOOR_GRACE_AFTER_END_MS,
  doorStillOpen,
  eventEnd,
  eventPhase,
  eventStart,
  isEventOver,
  isPastEvent,
  type EventPhase,
  type EventTimeFields,
} from "../../supabase/functions/_shared/eventTime.ts";

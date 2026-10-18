/**
 * Public API of the SkillSwap module. Import from "@/modules/skillswap",
 * never from a file inside it.
 *
 * Note: this barrel re-exports server-only code, so a Client Component must
 * not import it. Client Components inside the module import their siblings
 * directly.
 */

export {
  createSkillSwapPost,
  updateSkillSwapPost,
  type SkillSwapFormState,
} from "./actions";

export {
  getSkillSwapDetails,
  getSkillSwapForEdit,
  listSkillSwapPosts,
} from "./queries";

export {
  EMPTY_SKILLSWAP_FORM,
  MEETING_METHOD_OPTIONS,
  MEETING_METHODS,
  meetingMethodLabel,
  readSkillSwapForm,
  SKILLSWAP_LIMITS,
  skillSwapPostIdSchema,
  skillSwapSchema,
  validateSkillSwapForm,
  type MeetingMethod,
  type SkillSwapFieldErrors,
  type SkillSwapFormValues,
  type SkillSwapInput,
} from "./schema";

export {
  BOARD_MAX_PAGES,
  BOARD_PAGE_SIZE,
  boardHref,
  escapeLikePattern,
  parseBoardSearch,
  SEARCH_TERM_LENGTH,
  type BoardSearch,
  type SearchField,
} from "./search";

export type { SkillSwapCard, SkillSwapDetails } from "./types";

export { SkillSwapForm } from "./components/SkillSwapForm";

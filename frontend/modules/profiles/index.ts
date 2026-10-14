/**
 * Public API of the profiles module. Import from "@/modules/profiles", never
 * from a file inside it.
 *
 * Note: `queries` is server-only, so a Client Component must not import this
 * barrel. Client Components inside the module import their siblings directly.
 */

export { getDisplayNames, getMyProfile, getProfile } from "./queries";

export { updateMyProfile, type ProfileFormState } from "./actions";

export {
  parseInterests,
  PROFILE_LIMITS,
  profileFormSchema,
  profileFormValues,
  profileIdSchema,
  readProfileForm,
  validateProfileForm,
  type ProfileFieldErrors,
  type ProfileFormValues,
  type ProfileInput,
} from "./schema";

export type { Profile } from "./types";

export { InterestTags } from "./components/InterestTags";
export { ProfileCard } from "./components/ProfileCard";
export { ProfileView } from "./components/ProfileView";

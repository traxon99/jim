/**
 * The Settings screen's sub screens (issue #650), in the order the list shows
 * them. Each lives at its own route so Settings reads as a short menu instead
 * of one long scroll.
 */
export type SettingsScreen = {
  /** Matches the icon picked in SettingsMenu. */
  key:
    | "account"
    | "social"
    | "workout"
    | "gyms"
    | "appearance"
    | "notifications"
    | "advanced"
    | "setup"
    | "feedback";
  title: string;
  /** One line under the title saying what's inside. */
  hint: string;
  href: string;
};

export const SETTINGS_GROUPS: readonly (readonly SettingsScreen[])[] = [
  [
    {
      key: "account",
      title: "Account",
      hint: "Photo, username and your data",
      href: "/profile/settings/account",
    },
    {
      key: "social",
      title: "Social",
      hint: "What friends see and your shared links",
      href: "/profile/settings/social",
    },
  ],
  [
    {
      key: "workout",
      title: "Workout",
      hint: "Units, rest, idle workouts and body stats",
      href: "/profile/settings/workout",
    },
    { key: "gyms", title: "Gyms", hint: "Your gyms and their equipment", href: "/profile/gyms" },
    {
      key: "advanced",
      title: "Advanced",
      hint: "RPE, PRP, pace tracker, set types and Claude",
      href: "/profile/settings/advanced",
    },
  ],
  [
    {
      key: "appearance",
      title: "Appearance",
      hint: "Theme, accent color, font and cards",
      href: "/profile/settings/appearance",
    },
    {
      key: "notifications",
      title: "Notifications",
      hint: "Rest timer, workout reminders and What's new",
      href: "/profile/settings/notifications",
    },
  ],
  [
    {
      key: "setup",
      title: "Setup walkthrough",
      hint: "Home gym, program, PRP and theme in a few steps",
      // Reruns the new-user walkthrough any time (issue #464).
      href: "/profile/setup?from=settings",
    },
    {
      key: "feedback",
      title: "Send feedback",
      hint: "Report a bug or ask for a feature",
      href: "/profile/settings/feedback",
    },
  ],
];

/** Back link for a Settings sub screen. */
export const SETTINGS_BACK = { href: "/profile/settings", label: "Settings" } as const;

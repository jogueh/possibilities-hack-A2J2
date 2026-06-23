export type Profile = {
  name: string;
  headline: string;
  initials: string;
  profileViews: number;
  postImpressions: number;
};

export const profile: Profile = {
  name: "Ada Lovelace",
  headline:
    "Mathematician & First Programmer · Analytical Engine Enthusiast at The Difference Engine Co.",
  initials: "AL",
  profileViews: 142,
  postImpressions: 1_287,
};

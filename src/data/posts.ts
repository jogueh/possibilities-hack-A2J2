export type Post = {
  id: string;
  authorName: string;
  authorInitials: string;
  authorHeadline: string;
  timeAgo: string;
  body: string;
  imageLabel?: string;
  reactions: number;
  comments: number;
  reposts: number;
};

export const posts: Post[] = [
  {
    id: "p1",
    authorName: "Grace Hopper",
    authorInitials: "GH",
    authorHeadline: "Rear Admiral · Compiler Pioneer · COBOL Co-creator",
    timeAgo: "2h",
    body: "If you ever wondered whether you could ship a compiler before lunch — yes, you can. It just takes a team that isn't afraid of nanoseconds.",
    reactions: 1842,
    comments: 96,
    reposts: 42,
  },
  {
    id: "p2",
    authorName: "Alan Turing",
    authorInitials: "AT",
    authorHeadline: "Mathematician · Cryptanalyst · Universal Machine Designer",
    timeAgo: "5h",
    body: "Reminder: a problem being undecidable doesn't mean you can't get coffee while waiting for the answer. Take the break.",
    imageLabel: "WHITEBOARD SKETCH",
    reactions: 3120,
    comments: 211,
    reposts: 188,
  },
  {
    id: "p3",
    authorName: "Hedy Lamarr",
    authorInitials: "HL",
    authorHeadline: "Inventor · Frequency Hopping Spread Spectrum",
    timeAgo: "Yesterday",
    body: "Thrilled to announce our patent on a new signal hopping technique. Yes, I act too. People can do more than one thing.",
    reactions: 982,
    comments: 54,
    reposts: 31,
  },
  {
    id: "p4",
    authorName: "Katherine Johnson",
    authorInitials: "KJ",
    authorHeadline: "Mathematician at NASA",
    timeAgo: "Yesterday",
    body: "Check the math. Then check it again. Then check it on the rocket. Then check it on the way back.",
    imageLabel: "FLIGHT PATH DIAGRAM",
    reactions: 4501,
    comments: 320,
    reposts: 412,
  },
  {
    id: "p5",
    authorName: "Linus Pauling",
    authorInitials: "LP",
    authorHeadline: "Chemist · Two-time Nobel Laureate",
    timeAgo: "2d",
    body: "The best way to have a good idea is to have a lot of ideas. (And to write them down — I lose half of mine on napkins.)",
    reactions: 612,
    comments: 38,
    reposts: 14,
  },
  {
    id: "p6",
    authorName: "Margaret Hamilton",
    authorInitials: "MH",
    authorHeadline: "Software Engineer · Apollo Guidance Computer",
    timeAgo: "3d",
    body: "We just stacked the source listings next to me and they are taller than I am. Don't ship software you can't hug.",
    imageLabel: "AGC SOURCE LISTING",
    reactions: 2774,
    comments: 145,
    reposts: 220,
  },
];

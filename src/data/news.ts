export type NewsItem = {
  id: string;
  title: string;
  timeAgo: string;
  readers: number;
};

export const news: NewsItem[] = [
  {
    id: "n1",
    title: "Difference engines are back in vogue",
    timeAgo: "4h ago",
    readers: 12_204,
  },
  {
    id: "n2",
    title: "Why every team is hiring a punch-card auditor",
    timeAgo: "6h ago",
    readers: 8_311,
  },
  {
    id: "n3",
    title: "Steam-powered laptops gain market share",
    timeAgo: "9h ago",
    readers: 4_550,
  },
  {
    id: "n4",
    title: "Remote work, but for telegrams",
    timeAgo: "1d ago",
    readers: 2_902,
  },
  {
    id: "n5",
    title: "Soft skills: persuading the analytical engine",
    timeAgo: "2d ago",
    readers: 1_487,
  },
];

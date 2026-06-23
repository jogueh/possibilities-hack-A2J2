import ProfileCard from "@/components/ProfileCard";
import Feed from "@/components/Feed";
import NewsPanel from "@/components/NewsPanel";
import PromoCard from "@/components/PromoCard";

export default function HomePage() {
  return (
    <div className="home-grid">
      <aside>
        <ProfileCard />
      </aside>
      <Feed />
      <aside>
        <NewsPanel />
        <PromoCard />
      </aside>
    </div>
  );
}

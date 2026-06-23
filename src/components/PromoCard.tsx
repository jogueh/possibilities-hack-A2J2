import { Avatar, Button } from "antd";

export default function PromoCard() {
  return (
    <div className="promo-card" style={{ marginTop: 16 }}>
      <div className="promo-card-label">Promoted</div>
      <div className="promo-card-title">
        Ada, see who&apos;s hiring Mathematicians in your network
      </div>
      <div className="promo-card-avatar-row">
        <Avatar size={48} style={{ backgroundColor: "#0a66c2", color: "#fff" }}>
          DE
        </Avatar>
        <Avatar size={48} style={{ backgroundColor: "#5f9b41", color: "#fff" }}>
          NA
        </Avatar>
      </div>
      <Button type="primary" block>
        Try Premium for free
      </Button>
    </div>
  );
}

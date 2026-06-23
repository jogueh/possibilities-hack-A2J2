"use client";

import { InfoCircleOutlined, RightOutlined } from "@ant-design/icons";
import { news } from "@/data/news";

export default function NewsPanel() {
  return (
    <div className="side-card" aria-label="LinkedIn News">
      <div className="side-card-header">
        <span className="side-card-title">LinkedIn News</span>
        <InfoCircleOutlined style={{ color: "rgba(0,0,0,0.6)" }} />
      </div>
      <ul className="news-list">
        {news.map((item) => (
          <li key={item.id} className="news-item">
            <div className="news-item-title">• {item.title}</div>
            <div className="news-item-meta">
              {item.timeAgo} · {item.readers.toLocaleString()} readers
            </div>
          </li>
        ))}
      </ul>
      <div className="side-card-footer" style={{ paddingLeft: 16 }}>
        Show more <RightOutlined style={{ fontSize: 10 }} />
      </div>
    </div>
  );
}

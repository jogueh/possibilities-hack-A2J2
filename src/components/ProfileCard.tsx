"use client";

import { Avatar } from "antd";
import { BookOutlined } from "@ant-design/icons";
import { profile } from "@/data/profile";

export default function ProfileCard() {
  return (
    <div className="profile-card">
      <div className="profile-card-banner" aria-hidden="true" />
      <div className="profile-card-body">
        <Avatar
          size={72}
          className="profile-card-avatar"
          style={{
            backgroundColor: "#0a66c2",
            color: "#fff",
            fontSize: 26,
          }}
        >
          {profile.initials}
        </Avatar>
        <div className="profile-card-name">{profile.name}</div>
        <div className="profile-card-headline">{profile.headline}</div>
      </div>
      <div className="profile-card-section">
        <div className="profile-card-stat-row">
          <span>Profile viewers</span>
          <strong>{profile.profileViews}</strong>
        </div>
        <div className="profile-card-stat-row">
          <span>Post impressions</span>
          <strong>{profile.postImpressions.toLocaleString()}</strong>
        </div>
      </div>
      <div className="profile-card-saved">
        <BookOutlined />
        <span>Saved items</span>
      </div>
    </div>
  );
}

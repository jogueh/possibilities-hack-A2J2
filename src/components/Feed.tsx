"use client";

import { Avatar } from "antd";
import {
  PictureOutlined,
  VideoCameraOutlined,
  CalendarOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { profile } from "@/data/profile";
import { posts } from "@/data/posts";
import PostCard from "./PostCard";

export default function Feed() {
  return (
    <section aria-label="Feed">
      <div className="feed-composer">
        <div className="feed-composer-row">
          <Avatar
            size={48}
            style={{ backgroundColor: "#0a66c2", color: "#fff" }}
          >
            {profile.initials}
          </Avatar>
          <button type="button" className="feed-composer-prompt">
            Start a post
          </button>
        </div>
        <div className="feed-composer-actions">
          <button type="button" className="feed-composer-action">
            <PictureOutlined style={{ color: "#378fe9", fontSize: 20 }} />
            Photo
          </button>
          <button type="button" className="feed-composer-action">
            <VideoCameraOutlined style={{ color: "#5f9b41", fontSize: 20 }} />
            Video
          </button>
          <button type="button" className="feed-composer-action">
            <CalendarOutlined style={{ color: "#c37d16", fontSize: 20 }} />
            Event
          </button>
          <button type="button" className="feed-composer-action">
            <EditOutlined style={{ color: "#e16745", fontSize: 20 }} />
            Write article
          </button>
        </div>
      </div>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </section>
  );
}

"use client";

import { Avatar } from "antd";
import {
  LikeOutlined,
  CommentOutlined,
  RetweetOutlined,
  SendOutlined,
} from "@ant-design/icons";
import type { Post } from "@/data/posts";

type Props = { post: Post };

export default function PostCard({ post }: Props) {
  return (
    <article className="post-card">
      <header className="post-card-header">
        <Avatar
          size={48}
          style={{ backgroundColor: "#dfe6ed", color: "#0a66c2", fontWeight: 600 }}
        >
          {post.authorInitials}
        </Avatar>
        <div>
          <div className="post-card-author-name">{post.authorName}</div>
          <div className="post-card-author-headline">{post.authorHeadline}</div>
          <div className="post-card-meta">
            {post.timeAgo} · <span aria-label="public">🌐</span>
          </div>
        </div>
      </header>
      <div className="post-card-body">{post.body}</div>
      {post.imageLabel ? (
        <div className="post-card-image" aria-hidden="true">
          {post.imageLabel}
        </div>
      ) : null}
      <div className="post-card-reactions">
        <span>👍 ❤️ 🎉 {post.reactions.toLocaleString()}</span>
        <span style={{ float: "right" }}>
          {post.comments} comments · {post.reposts} reposts
        </span>
      </div>
      <div className="post-card-actions">
        <button type="button" className="post-card-action">
          <LikeOutlined /> Like
        </button>
        <button type="button" className="post-card-action">
          <CommentOutlined /> Comment
        </button>
        <button type="button" className="post-card-action">
          <RetweetOutlined /> Repost
        </button>
        <button type="button" className="post-card-action">
          <SendOutlined /> Send
        </button>
      </div>
    </article>
  );
}

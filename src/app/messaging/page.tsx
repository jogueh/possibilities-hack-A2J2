"use client";

import { MessageOutlined } from "@ant-design/icons";
import PlaceholderPage from "@/components/PlaceholderPage";

export default function MessagingPage() {
  return (
    <PlaceholderPage
      title="Messaging"
      description="Your conversations would live here. Reach out to a connection to start a thread. (Mockup placeholder — no real messages.)"
      icon={<MessageOutlined />}
    />
  );
}

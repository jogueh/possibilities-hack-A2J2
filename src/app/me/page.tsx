"use client";

import { UserOutlined } from "@ant-design/icons";
import PlaceholderPage from "@/components/PlaceholderPage";

export default function MePage() {
  return (
    <PlaceholderPage
      title="Me"
      description="This would open your profile menu — view profile, settings, account, language, sign out. (Mockup placeholder.)"
      icon={<UserOutlined />}
    />
  );
}

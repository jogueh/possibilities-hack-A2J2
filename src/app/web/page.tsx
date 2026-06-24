import type { Metadata } from "next";
import WebBoard from "@/components/web/WebBoard";

export const metadata: Metadata = {
  title: "Network Web · Expand your web, reinforce its roots",
};

export default function WebPage() {
  return <WebBoard />;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Input, Avatar } from "antd";
import {
  SearchOutlined,
  HomeFilled,
  TeamOutlined,
  ShopOutlined,
  MessageOutlined,
  BellOutlined,
  CaretDownOutlined,
  AppstoreOutlined,
  DeploymentUnitOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

type Tab = {
  href: string;
  label: string;
  icon: ReactNode;
  // Match only this exact path (Home shouldn't be active on every page)
  exact?: boolean;
  // Render an avatar on the right side instead of an icon
  avatarLabel?: string;
};

const tabs: Tab[] = [
  { href: "/", label: "Home", icon: <HomeFilled />, exact: true },
  { href: "/network", label: "My Network", icon: <TeamOutlined /> },
  { href: "/web", label: "Web", icon: <DeploymentUnitOutlined /> },
  { href: "/jobs", label: "Jobs", icon: <ShopOutlined /> },
  { href: "/messaging", label: "Messaging", icon: <MessageOutlined /> },
  {
    href: "/notifications",
    label: "Notifications",
    icon: <BellOutlined />,
  },
  { href: "/me", label: "Me", icon: <AppstoreOutlined />, avatarLabel: "AL" },
];

export default function TopNav() {
  const pathname = usePathname();

  const isActive = (tab: Tab) => {
    if (tab.exact) return pathname === tab.href;
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  };

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <Link href="/" className="top-nav-logo" aria-label="LinkedIn">
          <img src="/LinkedIn_icon.svg" alt="" aria-hidden="true" width={34} height={34} />
        </Link>
        <Input
          className="top-nav-search"
          placeholder="Search"
          prefix={<SearchOutlined style={{ color: "rgba(0,0,0,0.45)" }} />}
          variant="filled"
          aria-label="Search"
        />
        <nav className="top-nav-tabs" aria-label="Primary">
          {tabs.map((tab) => {
            const active = isActive(tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`top-nav-tab${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="top-nav-tab-icon">
                  {tab.avatarLabel ? (
                    <Avatar size={24}>{tab.avatarLabel}</Avatar>
                  ) : (
                    tab.icon
                  )}
                </span>
                <span className="top-nav-tab-label">
                  {tab.label}
                  {tab.avatarLabel ? <CaretDownOutlined /> : null}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

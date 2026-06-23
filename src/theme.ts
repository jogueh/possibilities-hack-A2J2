import type { ThemeConfig } from "antd";

// LinkedIn-inspired Ant Design theme tokens.
export const linkedinTheme: ThemeConfig = {
  token: {
    colorPrimary: "#0a66c2",
    colorLink: "#0a66c2",
    colorLinkHover: "#004182",
    colorInfo: "#0a66c2",
    colorBgLayout: "#f4f2ee",
    borderRadius: 8,
    fontFamily:
      'var(--font-source-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    Card: {
      borderRadiusLG: 8,
    },
    Button: {
      borderRadius: 24,
      controlHeight: 36,
      fontWeight: 600,
    },
    Input: {
      borderRadius: 6,
    },
  },
};

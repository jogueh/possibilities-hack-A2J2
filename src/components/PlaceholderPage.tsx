import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  icon: ReactNode;
};

export default function PlaceholderPage({ title, description, icon }: Props) {
  return (
    <section className="placeholder-page" aria-label={title}>
      {icon}
      <h1 className="placeholder-page-title">{title}</h1>
      <p className="placeholder-page-body">{description}</p>
    </section>
  );
}

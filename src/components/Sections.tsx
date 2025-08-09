import { ReactNode } from "react";

export function Section({
  id,
  title,
  children,
  description,
}: {
  id: string;
  title: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <section id={id} data-snap-section className="py-24 sm:py-32 scroll-mt-28">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-white/70 max-w-2xl text-sm">
            {description}
          </p>
        )}
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

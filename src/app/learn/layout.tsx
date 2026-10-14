import LearnSubNav from "@/components/learn/hub/LearnSubNav";

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LearnSubNav />
      {children}
    </>
  );
}

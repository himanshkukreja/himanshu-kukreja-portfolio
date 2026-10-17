import Leaderboard from "@/components/learn/arena/Leaderboard";
import OnlineOnly from "@/components/offline/OnlineOnly";

export const metadata = {
  title: "Leaderboard · Arena · Himanshu Kukreja",
  description: "Weekly leagues from Intern to Principal and the all-time board for System Design Mastery.",
};

export default function LeaderboardPage() {
  return (
    <OnlineOnly what="The leaderboard" note="Your XP from offline reading counts: it syncs and shows up here when you're back online." className="mx-auto max-w-[860px] px-4 sm:px-6">
      <Leaderboard />
    </OnlineOnly>
  );
}

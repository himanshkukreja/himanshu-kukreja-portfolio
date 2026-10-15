import ArenaHub from "@/components/learn/arena/ArenaHub";
import { getQuestionBank } from "@/lib/learn/arena/bank";

export const runtime = "nodejs";
export const revalidate = 300;

export const metadata = {
  title: "Arena · Learn · Himanshu Kukreja",
  description: "Daily system design challenge, weekly leagues and quick games built from the System Design Mastery course.",
};

export default async function ArenaPage() {
  const bank = await getQuestionBank()
    .then((b) => ({ questions: b.questions.length, quizzes: b.quizzes, trials: b.trials }))
    .catch(() => null);
  return <ArenaHub bank={bank} />;
}

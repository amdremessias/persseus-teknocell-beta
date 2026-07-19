import { scoreEmoji } from "@/lib/utils";

export default function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="text-sm font-semibold" title={`Score: ${score}`}>
      {scoreEmoji(score)} {score}
    </span>
  );
}

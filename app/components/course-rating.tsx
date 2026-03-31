import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

type RatingSummaryProps = {
  averageRating: number | null;
  ratingCount: number;
  size?: "sm" | "md";
  className?: string;
};

export function CourseRatingSummary({
  averageRating,
  ratingCount,
  size = "sm",
  className,
}: RatingSummaryProps) {
  const iconSize = size === "md" ? "size-4" : "size-3.5";
  const textSize = size === "md" ? "text-sm" : "text-xs";
  const hasRatings = averageRating !== null && ratingCount > 0;

  return (
    <div className={cn("flex items-center gap-1.5 text-muted-foreground", textSize, className)}>
      <Star className={cn(iconSize, hasRatings ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50")} />
      {hasRatings ? (
        <span>
          {averageRating.toFixed(1)} ({ratingCount})
        </span>
      ) : (
        <span>No ratings yet</span>
      )}
    </div>
  );
}

type StarRatingInputProps = {
  currentRating: number | null;
  disabled?: boolean;
};

export function StarRatingInput({
  currentRating,
  disabled = false,
}: StarRatingInputProps) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((value) => {
        const active = (currentRating ?? 0) >= value;
        return (
          <button
            key={value}
            type="submit"
            name="rating"
            value={value}
            disabled={disabled}
            className="rounded-sm p-1 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
          >
            <Star
              className={cn(
                "size-6 transition-colors",
                active
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

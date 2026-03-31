import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

export type CourseRatingSummary = {
  averageRating: number | null;
  ratingCount: number;
};

export function getUserCourseRating(userId: number, courseId: number) {
  return db
    .select()
    .from(courseRatings)
    .where(
      and(eq(courseRatings.userId, userId), eq(courseRatings.courseId, courseId))
    )
    .get();
}

export function saveCourseRating(userId: number, courseId: number, rating: number) {
  const existing = getUserCourseRating(userId, courseId);

  if (existing) {
    return db
      .update(courseRatings)
      .set({ rating, updatedAt: new Date().toISOString() })
      .where(eq(courseRatings.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating })
    .returning()
    .get();
}

export function getCourseRatingSummary(courseId: number): CourseRatingSummary {
  const result = db
    .select({
      averageRating: sql<number | null>`avg(${courseRatings.rating})`,
      ratingCount: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return {
    averageRating: result?.averageRating ?? null,
    ratingCount: result?.ratingCount ?? 0,
  };
}

export function getCourseRatingSummaries(courseIds: number[]) {
  if (courseIds.length === 0) {
    return new Map<number, CourseRatingSummary>();
  }

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      averageRating: sql<number | null>`avg(${courseRatings.rating})`,
      ratingCount: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  const summaries = new Map<number, CourseRatingSummary>();

  for (const row of rows) {
    summaries.set(row.courseId, {
      averageRating: row.averageRating ?? null,
      ratingCount: row.ratingCount,
    });
  }

  return summaries;
}

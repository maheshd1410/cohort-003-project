import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  getCourseRatingSummaries,
  getCourseRatingSummary,
  getUserCourseRating,
  saveCourseRating,
} from "./courseRatingService";

describe("courseRatingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("saveCourseRating", () => {
    it("creates a new rating", () => {
      const rating = saveCourseRating(base.user.id, base.course.id, 4);

      expect(rating.userId).toBe(base.user.id);
      expect(rating.courseId).toBe(base.course.id);
      expect(rating.rating).toBe(4);
    });

    it("updates an existing rating instead of inserting a second row", () => {
      const first = saveCourseRating(base.user.id, base.course.id, 3);
      const second = saveCourseRating(base.user.id, base.course.id, 5);

      const allRatings = testDb.select().from(schema.courseRatings).all();

      expect(second.id).toBe(first.id);
      expect(second.rating).toBe(5);
      expect(allRatings).toHaveLength(1);
    });
  });

  describe("getUserCourseRating", () => {
    it("returns the current user's rating for a course", () => {
      saveCourseRating(base.user.id, base.course.id, 5);

      const rating = getUserCourseRating(base.user.id, base.course.id);

      expect(rating?.rating).toBe(5);
    });

    it("returns undefined when the user has not rated the course", () => {
      expect(getUserCourseRating(base.user.id, base.course.id)).toBeUndefined();
    });
  });

  describe("getCourseRatingSummary", () => {
    it("returns null average and zero count when there are no ratings", () => {
      expect(getCourseRatingSummary(base.course.id)).toEqual({
        averageRating: null,
        ratingCount: 0,
      });
    });

    it("returns the average rating and total rating count", () => {
      const secondUser = testDb
        .insert(schema.users)
        .values({
          name: "Second Student",
          email: "second-student@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();

      saveCourseRating(base.user.id, base.course.id, 4);
      saveCourseRating(secondUser.id, base.course.id, 5);

      expect(getCourseRatingSummary(base.course.id)).toEqual({
        averageRating: 4.5,
        ratingCount: 2,
      });
    });
  });

  describe("getCourseRatingSummaries", () => {
    it("returns summaries keyed by course id", () => {
      const secondCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Second Course",
          slug: "second-course",
          description: "Another course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      saveCourseRating(base.user.id, base.course.id, 2);
      saveCourseRating(base.user.id, secondCourse.id, 5);

      const summaries = getCourseRatingSummaries([base.course.id, secondCourse.id]);

      expect(summaries.get(base.course.id)).toEqual({
        averageRating: 2,
        ratingCount: 1,
      });
      expect(summaries.get(secondCourse.id)).toEqual({
        averageRating: 5,
        ratingCount: 1,
      });
    });

    it("returns an empty map when no course ids are provided", () => {
      expect(getCourseRatingSummaries([]).size).toBe(0);
    });
  });
});

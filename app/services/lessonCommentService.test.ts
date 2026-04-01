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
  createLessonComment,
  deleteLessonComment,
  doesCommentBelongToCourse,
  getCommentsForLessonModeration,
  getLessonCommentById,
  getVisibleCommentsForLesson,
  updateLessonCommentStatus,
} from "./lessonCommentService";
import { createLesson } from "./lessonService";
import { createModule } from "./moduleService";

describe("lessonCommentService", () => {
  let moduleId: number;
  let lessonId: number;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    const mod = createModule(base.course.id, "Module 1", 1);
    moduleId = mod.id;
    lessonId = createLesson(moduleId, "Lesson 1", null, null, 1, null).id;
  });

  it("creates a visible lesson comment", () => {
    const comment = createLessonComment(lessonId, base.user.id, "Helpful lesson.");

    expect(comment.lessonId).toBe(lessonId);
    expect(comment.userId).toBe(base.user.id);
    expect(comment.status).toBe(schema.LessonCommentStatus.Visible);
  });

  it("returns only visible comments for students", () => {
    createLessonComment(lessonId, base.user.id, "Visible comment");
    const hidden = createLessonComment(lessonId, base.user.id, "Hidden comment");
    updateLessonCommentStatus(
      hidden.id,
      schema.LessonCommentStatus.Hidden,
      base.instructor.id
    );

    const comments = getVisibleCommentsForLesson(lessonId);

    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("Visible comment");
  });

  it("returns hidden comments in moderation view", () => {
    const comment = createLessonComment(lessonId, base.user.id, "Need review");
    updateLessonCommentStatus(
      comment.id,
      schema.LessonCommentStatus.Hidden,
      base.instructor.id
    );

    const comments = getCommentsForLessonModeration(lessonId);

    expect(comments).toHaveLength(1);
    expect(comments[0].status).toBe(schema.LessonCommentStatus.Hidden);
    expect(comments[0].authorName).toBe(base.user.name);
  });

  it("updates moderation metadata when hiding a comment", () => {
    const comment = createLessonComment(lessonId, base.user.id, "Hide me");

    const updated = updateLessonCommentStatus(
      comment.id,
      schema.LessonCommentStatus.Hidden,
      base.instructor.id
    );

    expect(updated?.status).toBe(schema.LessonCommentStatus.Hidden);
    expect(updated?.moderatedByUserId).toBe(base.instructor.id);
    expect(updated?.moderatedAt).toBeTruthy();
  });

  it("deletes a comment", () => {
    const comment = createLessonComment(lessonId, base.user.id, "Temporary");

    const deleted = deleteLessonComment(comment.id);

    expect(deleted?.id).toBe(comment.id);
    expect(getLessonCommentById(comment.id)).toBeUndefined();
  });

  it("checks whether a comment belongs to a course", () => {
    const comment = createLessonComment(lessonId, base.user.id, "Scoped");
    const otherCourse = testDb
      .insert(schema.courses)
      .values({
        title: "Other Course",
        slug: "other-course",
        description: "Another course",
        instructorId: base.instructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();

    expect(doesCommentBelongToCourse(comment.id, base.course.id)).toBe(true);
    expect(doesCommentBelongToCourse(comment.id, otherCourse.id)).toBe(false);
  });
});

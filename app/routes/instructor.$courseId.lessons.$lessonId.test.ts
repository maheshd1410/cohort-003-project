import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import { loader, action } from "./instructor.$courseId.lessons.$lessonId";
import { createModule } from "~/services/moduleService";
import { createLesson } from "~/services/lessonService";
import {
  createLessonComment,
  getLessonCommentById,
  updateLessonCommentStatus,
} from "~/services/lessonCommentService";

async function cookieForUser(userId: number) {
  const request = new Request("http://localhost/");
  return setCurrentUserId(request, userId);
}

describe("instructor.$courseId.lessons.$lessonId route", () => {
  let lessonId: number;
  let secondLessonId: number;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);

    const mod = createModule(base.course.id, "Module 1", 1);
    lessonId = createLesson(mod.id, "Lesson 1", null, null, 1, null).id;
    secondLessonId = createLesson(mod.id, "Lesson 2", null, null, 2, null).id;
  });

  describe("loader", () => {
    it("returns comments for instructor moderation on the lesson editor", async () => {
      createLessonComment(lessonId, base.user.id, "Please clarify this part.");
      const cookie = await cookieForUser(base.instructor.id);

      const result = await loader({
        params: {
          courseId: String(base.course.id),
          lessonId: String(lessonId),
        },
        request: new Request(`http://localhost/instructor/${base.course.id}/lessons/${lessonId}`, {
          headers: { Cookie: cookie },
        }),
        context: {},
      } as never);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].body).toBe("Please clarify this part.");
    });
  });

  describe("action", () => {
    it("allows the course instructor to hide a comment and records moderation metadata", async () => {
      const comment = createLessonComment(lessonId, base.user.id, "Needs moderation");
      const cookie = await cookieForUser(base.instructor.id);

      const formData = new FormData();
      formData.set("intent", "hide-comment");
      formData.set("commentId", String(comment.id));

      const result = await action({
        params: {
          courseId: String(base.course.id),
          lessonId: String(lessonId),
        },
        request: new Request(`http://localhost/instructor/${base.course.id}/lessons/${lessonId}`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: formData,
        }),
        context: {},
      } as never);

      const updated = getLessonCommentById(comment.id);

      expect(result).toEqual({
        success: true,
        field: "comment",
        action: "hidden",
      });
      expect(updated?.status).toBe(schema.LessonCommentStatus.Hidden);
      expect(updated?.moderatedByUserId).toBe(base.instructor.id);
      expect(updated?.moderatedAt).toBeTruthy();
    });

    it("allows the course instructor to show a hidden comment again", async () => {
      const comment = createLessonComment(secondLessonId, base.user.id, "Restore me");
      updateLessonCommentStatus(
        comment.id,
        schema.LessonCommentStatus.Hidden,
        base.instructor.id
      );

      const cookie = await cookieForUser(base.instructor.id);
      const formData = new FormData();
      formData.set("intent", "show-comment");
      formData.set("commentId", String(comment.id));

      const result = await action({
        params: {
          courseId: String(base.course.id),
          lessonId: String(secondLessonId),
        },
        request: new Request(`http://localhost/instructor/${base.course.id}/lessons/${secondLessonId}`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: formData,
        }),
        context: {},
      } as never);

      const updated = getLessonCommentById(comment.id);

      expect(result).toEqual({
        success: true,
        field: "comment",
        action: "shown",
      });
      expect(updated?.status).toBe(schema.LessonCommentStatus.Visible);
      expect(updated?.moderatedByUserId).toBe(base.instructor.id);
      expect(updated?.moderatedAt).toBeTruthy();
    });

    it("rejects moderation attempts against comments from a different lesson", async () => {
      const otherLessonComment = createLessonComment(
        secondLessonId,
        base.user.id,
        "Wrong lesson target"
      );
      const cookie = await cookieForUser(base.instructor.id);

      const formData = new FormData();
      formData.set("intent", "delete-comment");
      formData.set("commentId", String(otherLessonComment.id));

      const result = await action({
        params: {
          courseId: String(base.course.id),
          lessonId: String(lessonId),
        },
        request: new Request(`http://localhost/instructor/${base.course.id}/lessons/${lessonId}`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: formData,
        }),
        context: {},
      } as never);

      expect(result.type).toBe("DataWithResponseInit");
      expect(result.init?.status).toBe(404);
      expect(result.data).toEqual({
        error: "Comment not found for this lesson.",
      });
      expect(getLessonCommentById(otherLessonComment.id)).toBeTruthy();
    });
  });
});

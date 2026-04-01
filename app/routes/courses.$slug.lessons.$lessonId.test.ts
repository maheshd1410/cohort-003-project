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

import { loader, action } from "./courses.$slug.lessons.$lessonId";
import { createModule } from "~/services/moduleService";
import { createLesson } from "~/services/lessonService";
import { enrollUser } from "~/services/enrollmentService";
import {
  createLessonComment,
  updateLessonCommentStatus,
} from "~/services/lessonCommentService";

async function cookieForUser(userId: number) {
  const request = new Request("http://localhost/");
  return setCurrentUserId(request, userId);
}

describe("courses.$slug.lessons.$lessonId route", () => {
  let lessonId: number;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);

    const mod = createModule(base.course.id, "Module 1", 1);
    lessonId = createLesson(mod.id, "Lesson 1", null, null, 1, null).id;
  });

  describe("loader", () => {
    it("returns only visible lesson comments", async () => {
      createLessonComment(lessonId, base.user.id, "Visible comment");
      const hidden = createLessonComment(lessonId, base.user.id, "Hidden comment");
      updateLessonCommentStatus(
        hidden.id,
        schema.LessonCommentStatus.Hidden,
        base.instructor.id
      );

      const result = await loader({
        params: {
          slug: base.course.slug,
          lessonId: String(lessonId),
        },
        request: new Request(`http://localhost/courses/${base.course.slug}/lessons/${lessonId}`),
        context: {},
      } as never);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].body).toBe("Visible comment");
    });
  });

  describe("action", () => {
    it("allows enrolled students to post lesson comments", async () => {
      enrollUser(base.user.id, base.course.id, false, false);
      const cookie = await cookieForUser(base.user.id);

      const formData = new FormData();
      formData.set("intent", "add-comment");
      formData.set("body", "This lesson helped.");

      const result = await action({
        params: {
          slug: base.course.slug,
          lessonId: String(lessonId),
        },
        request: new Request(`http://localhost/courses/${base.course.slug}/lessons/${lessonId}`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: formData,
        }),
        context: {},
      } as never);

      const savedComments = testDb.select().from(schema.lessonComments).all();

      expect(result).toEqual({ success: true, field: "comment" });
      expect(savedComments).toHaveLength(1);
      expect(savedComments[0].body).toBe("This lesson helped.");
    });

    it("rejects comment creation for unenrolled students", async () => {
      const cookie = await cookieForUser(base.user.id);

      const formData = new FormData();
      formData.set("intent", "add-comment");
      formData.set("body", "I should not be able to post.");

      const result = await action({
        params: {
          slug: base.course.slug,
          lessonId: String(lessonId),
        },
        request: new Request(`http://localhost/courses/${base.course.slug}/lessons/${lessonId}`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: formData,
        }),
        context: {},
      } as never);

      expect(result.type).toBe("DataWithResponseInit");
      expect(result.init?.status).toBe(403);
      expect(result.data).toEqual({
        error: "Only enrolled students can comment on lessons.",
      });
      expect(testDb.select().from(schema.lessonComments).all()).toHaveLength(0);
    });

    it("rejects empty or whitespace-only comments", async () => {
      enrollUser(base.user.id, base.course.id, false, false);
      const cookie = await cookieForUser(base.user.id);

      const formData = new FormData();
      formData.set("intent", "add-comment");
      formData.set("body", "   ");

      const result = await action({
        params: {
          slug: base.course.slug,
          lessonId: String(lessonId),
        },
        request: new Request(`http://localhost/courses/${base.course.slug}/lessons/${lessonId}`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: formData,
        }),
        context: {},
      } as never);

      expect(result.type).toBe("DataWithResponseInit");
      expect(result.init?.status).toBe(400);
      expect(result.data).toEqual({
        error: "Comment cannot be empty.",
      });
      expect(testDb.select().from(schema.lessonComments).all()).toHaveLength(0);
    });
  });
});

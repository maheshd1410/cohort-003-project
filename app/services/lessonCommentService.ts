import { and, asc, eq } from "drizzle-orm";
import { db } from "~/db";
import {
  lessonComments,
  lessons,
  modules,
  users,
  LessonCommentStatus,
} from "~/db/schema";

export function getLessonCommentById(id: number) {
  return db.select().from(lessonComments).where(eq(lessonComments.id, id)).get();
}

export function getVisibleCommentsForLesson(lessonId: number) {
  return db
    .select({
      id: lessonComments.id,
      lessonId: lessonComments.lessonId,
      userId: lessonComments.userId,
      body: lessonComments.body,
      status: lessonComments.status,
      moderatedByUserId: lessonComments.moderatedByUserId,
      moderatedAt: lessonComments.moderatedAt,
      createdAt: lessonComments.createdAt,
      updatedAt: lessonComments.updatedAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorRole: users.role,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(
      and(
        eq(lessonComments.lessonId, lessonId),
        eq(lessonComments.status, LessonCommentStatus.Visible)
      )
    )
    .orderBy(asc(lessonComments.createdAt))
    .all();
}

export function getCommentsForLessonModeration(lessonId: number) {
  return db
    .select({
      id: lessonComments.id,
      lessonId: lessonComments.lessonId,
      userId: lessonComments.userId,
      body: lessonComments.body,
      status: lessonComments.status,
      moderatedByUserId: lessonComments.moderatedByUserId,
      moderatedAt: lessonComments.moderatedAt,
      createdAt: lessonComments.createdAt,
      updatedAt: lessonComments.updatedAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorRole: users.role,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(eq(lessonComments.lessonId, lessonId))
    .orderBy(asc(lessonComments.createdAt))
    .all();
}

export function createLessonComment(lessonId: number, userId: number, body: string) {
  return db
    .insert(lessonComments)
    .values({
      lessonId,
      userId,
      body,
      status: LessonCommentStatus.Visible,
    })
    .returning()
    .get();
}

export function updateLessonCommentStatus(
  id: number,
  status: LessonCommentStatus,
  moderatedByUserId: number
) {
  return db
    .update(lessonComments)
    .set({
      status,
      moderatedByUserId,
      moderatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(lessonComments.id, id))
    .returning()
    .get();
}

export function deleteLessonComment(id: number) {
  return db
    .delete(lessonComments)
    .where(eq(lessonComments.id, id))
    .returning()
    .get();
}

export function doesCommentBelongToCourse(commentId: number, courseId: number) {
  const row = db
    .select({ commentId: lessonComments.id })
    .from(lessonComments)
    .innerJoin(lessons, eq(lessonComments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(and(eq(lessonComments.id, commentId), eq(modules.courseId, courseId)))
    .get();

  return !!row;
}

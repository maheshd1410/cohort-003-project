import { useState, useEffect } from "react";
import { Link, useFetcher, useBlocker } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/instructor.$courseId.lessons.$lessonId";
import { getCourseById } from "~/services/courseService";
import { getLessonById, updateLesson } from "~/services/lessonService";
import { getModuleById } from "~/services/moduleService";
import { getQuizByLessonId } from "~/services/quizService";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { LessonCommentStatus, UserRole } from "~/db/schema";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { MonacoMarkdownEditor } from "~/components/monaco-markdown-editor";
import { AlertTriangle, ArrowLeft, ClipboardList, ExternalLink, Eye, EyeOff, Github, Save, Trash2 } from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { z } from "zod";
import { parseFormData, parseParams } from "~/lib/validation";
import {
  deleteLessonComment,
  getCommentsForLessonModeration,
  getLessonCommentById,
  updateLessonCommentStatus,
} from "~/services/lessonCommentService";
import { UserAvatar } from "~/components/user-avatar";

const instructorLessonParamsSchema = z.object({
  courseId: z.coerce.number().int(),
  lessonId: z.coerce.number().int(),
});

const updateLessonSchema = z.object({
  intent: z.literal("update-lesson"),
  content: z.string().optional(),
  videoUrl: z.string().trim().optional(),
  durationMinutes: z.string().optional(),
  githubRepoUrl: z.string().trim().optional(),
});

const moderateCommentSchema = z.union([
  z.object({
    intent: z.literal("hide-comment"),
    commentId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("show-comment"),
    commentId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("delete-comment"),
    commentId: z.coerce.number().int(),
  }),
]);

export function meta({ data: loaderData }: Route.MetaArgs) {
  const title = loaderData?.lesson?.title ?? "Edit Lesson";
  return [
    { title: `Edit: ${title} — Cadence` },
    { name: "description", content: `Edit lesson: ${title}` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to manage lessons.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (!user || (user.role !== UserRole.Instructor && user.role !== UserRole.Admin)) {
    throw data("Only instructors and admins can access this page.", {
      status: 403,
    });
  }

  const courseId = parseInt(params.courseId, 10);
  if (isNaN(courseId)) {
    throw data("Invalid course ID.", { status: 400 });
  }

  const course = getCourseById(courseId);

  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  if (course.instructorId !== currentUserId && user.role !== UserRole.Admin) {
    throw data("You can only edit your own courses.", { status: 403 });
  }

  const lessonId = parseInt(params.lessonId, 10);
  if (isNaN(lessonId)) {
    throw data("Invalid lesson ID.", { status: 400 });
  }

  const lesson = getLessonById(lessonId);
  if (!lesson) {
    throw data("Lesson not found.", { status: 404 });
  }

  const mod = getModuleById(lesson.moduleId);
  if (!mod || mod.courseId !== courseId) {
    throw data("Lesson not found in this course.", { status: 404 });
  }

  const quiz = getQuizByLessonId(lessonId);
  const comments = getCommentsForLessonModeration(lessonId);

  return { course, lesson, module: mod, quiz, comments };
}

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  const user = getUserById(currentUserId);
  if (!user || (user.role !== UserRole.Instructor && user.role !== UserRole.Admin)) {
    throw data("Only instructors and admins can edit lessons.", { status: 403 });
  }

  const { courseId, lessonId } = parseParams(params, instructorLessonParamsSchema);

  const course = getCourseById(courseId);
  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  if (course.instructorId !== currentUserId && user.role !== UserRole.Admin) {
    throw data("You can only edit your own courses.", { status: 403 });
  }

  const lesson = getLessonById(lessonId);
  if (!lesson) {
    throw data("Lesson not found.", { status: 404 });
  }

  const mod = getModuleById(lesson.moduleId);
  if (!mod || mod.courseId !== courseId) {
    throw data("Lesson not found in this course.", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-lesson") {
    const parsed = parseFormData(formData, updateLessonSchema);

    if (!parsed.success) {
      return data({ error: Object.values(parsed.errors)[0] ?? "Invalid input." }, { status: 400 });
    }

    const { content, videoUrl, durationMinutes: durationStr, githubRepoUrl } = parsed.data;
    const durationMinutes = durationStr ? parseInt(durationStr, 10) : null;

    if (durationMinutes !== null && (isNaN(durationMinutes) || durationMinutes < 0)) {
      return data({ error: "Duration must be a positive number." }, { status: 400 });
    }

    updateLesson(lessonId, null, content ?? null, videoUrl || null, durationMinutes, githubRepoUrl || null);
    return { success: true };
  }

  const moderationParsed = parseFormData(formData, moderateCommentSchema);
  if (moderationParsed.success) {
    const comment = getLessonCommentById(moderationParsed.data.commentId);
    if (!comment || comment.lessonId !== lessonId) {
      return data({ error: "Comment not found for this lesson." }, { status: 404 });
    }

    if (moderationParsed.data.intent === "hide-comment") {
      updateLessonCommentStatus(
        comment.id,
        LessonCommentStatus.Hidden,
        currentUserId
      );
      return { success: true, field: "comment", action: "hidden" };
    }

    if (moderationParsed.data.intent === "show-comment") {
      updateLessonCommentStatus(
        comment.id,
        LessonCommentStatus.Visible,
        currentUserId
      );
      return { success: true, field: "comment", action: "shown" };
    }

    if (moderationParsed.data.intent === "delete-comment") {
      deleteLessonComment(comment.id);
      return { success: true, field: "comment", action: "deleted" };
    }
  }

  throw data("Invalid action.", { status: 400 });
}

export default function InstructorLessonEditor({
  loaderData,
}: Route.ComponentProps) {
  const { course, lesson, module: mod, quiz, comments } = loaderData;
  const fetcher = useFetcher();
  const moderationFetcher = useFetcher<{ success?: boolean; error?: string; field?: string; action?: string }>();

  const [content, setContent] = useState(lesson.content ?? "");
  const [videoUrl, setVideoUrl] = useState(lesson.videoUrl ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    lesson.durationMinutes?.toString() ?? ""
  );
  const [githubRepoUrl, setGithubRepoUrl] = useState(
    lesson.githubRepoUrl ?? ""
  );

  const hasChanges =
    content !== (lesson.content ?? "") ||
    videoUrl !== (lesson.videoUrl ?? "") ||
    durationMinutes !== (lesson.durationMinutes?.toString() ?? "") ||
    githubRepoUrl !== (lesson.githubRepoUrl ?? "");

  const blocker = useBlocker(hasChanges);

  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      toast.success("Lesson saved.");
    }
    if (fetcher.state === "idle" && fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (moderationFetcher.state === "idle" && moderationFetcher.data?.success) {
      const action = moderationFetcher.data.action ?? "updated";
      toast.success(`Comment ${action}.`);
    }
    if (moderationFetcher.state === "idle" && moderationFetcher.data?.error) {
      toast.error(moderationFetcher.data.error);
    }
  }, [moderationFetcher.state, moderationFetcher.data]);

  function handleSave() {
    fetcher.submit(
      {
        intent: "update-lesson",
        content,
        videoUrl,
        durationMinutes,
        githubRepoUrl,
      },
      { method: "post" }
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Unsaved changes blocker dialog */}
      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="mx-4 w-full max-w-md">
            <CardHeader>
              <h2 className="text-lg font-semibold">Unsaved Changes</h2>
              <p className="text-sm text-muted-foreground">
                You have unsaved changes that will be lost if you leave this
                page.
              </p>
            </CardHeader>
            <CardContent className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => blocker.reset()}>
                Stay on Page
              </Button>
              <Button
                variant="destructive"
                onClick={() => blocker.proceed()}
              >
                Leave Page
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <Link
          to={`/instructor/${course.id}`}
          className="hover:text-foreground"
        >
          {course.title}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{lesson.title}</span>
      </nav>

      <Link
        to={`/instructor/${course.id}`}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 size-4" />
        Back to Course Editor
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{lesson.title}</h1>
          <Link to={`/courses/${course.slug}/lessons/${lesson.id}`}>
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1.5 size-4" />
              View Lesson
            </Button>
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Module: {mod.title}
        </p>
      </div>

      <div className="space-y-6">
        {/* Content */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Lesson Content</h2>
            <p className="text-sm text-muted-foreground">
              Write lesson content in Markdown. Press Ctrl+S to format and save.
            </p>
          </CardHeader>
          <CardContent>
            <MonacoMarkdownEditor
              value={content}
              onChange={setContent}
              onSave={handleSave}
            />
          </CardContent>
        </Card>

        {/* Video URL */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Video</h2>
            <p className="text-sm text-muted-foreground">
              Paste a YouTube video URL to embed in this lesson.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="videoUrl">YouTube URL</Label>
              <Input
                id="videoUrl"
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Duration */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Duration</h2>
            <p className="text-sm text-muted-foreground">
              Set the estimated time to complete this lesson.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min="0"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="e.g. 15"
                className="max-w-32"
              />
            </div>
          </CardContent>
        </Card>

        {/* GitHub Repo */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">GitHub Repository</h2>
            <p className="text-sm text-muted-foreground">
              Link to a GitHub repository for this lesson's code.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="githubRepoUrl">Repository URL</Label>
              <Input
                id="githubRepoUrl"
                type="url"
                value={githubRepoUrl}
                onChange={(e) => setGithubRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
              />
            </div>
          </CardContent>
        </Card>

        {/* Quiz */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Quiz</h2>
            <p className="text-sm text-muted-foreground">
              {quiz
                ? `This lesson has a quiz: "${quiz.title}"`
                : "No quiz attached to this lesson yet."}
            </p>
          </CardHeader>
          <CardContent>
            <Link
              to={`/instructor/${course.id}/lessons/${lesson.id}/quiz`}
            >
              <Button variant="outline">
                <ClipboardList className="mr-1.5 size-4" />
                {quiz ? "Edit Quiz" : "Create Quiz"}
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Comment Moderation</h2>
            <p className="text-sm text-muted-foreground">
              Review student discussion for this lesson and hide or remove comments when needed.
            </p>
          </CardHeader>
          <CardContent>
            {comments.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No comments on this lesson yet.
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => {
                  const isHidden = comment.status === LessonCommentStatus.Hidden;
                  return (
                    <div key={comment.id} className="rounded-lg border p-4">
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={comment.authorName}
                            avatarUrl={comment.authorAvatarUrl}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{comment.authorName}</span>
                              <span
                                className={
                                  isHidden
                                    ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                                    : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
                                }
                              >
                                {isHidden ? "Hidden" : "Visible"}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Posted {new Date(comment.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <moderationFetcher.Form method="post">
                            <input
                              type="hidden"
                              name="intent"
                              value={isHidden ? "show-comment" : "hide-comment"}
                            />
                            <input type="hidden" name="commentId" value={comment.id} />
                            <Button type="submit" variant="outline" size="sm">
                              {isHidden ? (
                                <>
                                  <Eye className="mr-1.5 size-4" />
                                  Show
                                </>
                              ) : (
                                <>
                                  <EyeOff className="mr-1.5 size-4" />
                                  Hide
                                </>
                              )}
                            </Button>
                          </moderationFetcher.Form>
                          <moderationFetcher.Form method="post">
                            <input type="hidden" name="intent" value="delete-comment" />
                            <input type="hidden" name="commentId" value={comment.id} />
                            <Button type="submit" variant="outline" size="sm">
                              <Trash2 className="mr-1.5 size-4" />
                              Delete
                            </Button>
                          </moderationFetcher.Form>
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                        {comment.body}
                      </p>
                      {comment.moderatedAt && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Moderated {new Date(comment.moderatedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || fetcher.state !== "idle"}
          >
            <Save className="mr-1.5 size-4" />
            {fetcher.state !== "idle" ? "Saving..." : "Save Changes"}
          </Button>
          {hasChanges && (
            <span className="text-sm text-muted-foreground">
              You have unsaved changes.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading the lesson editor.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Lesson not found";
      message = "The lesson you're looking for doesn't exist or may have been removed.";
    } else if (error.status === 401) {
      title = "Sign in required";
      message = typeof error.data === "string" ? error.data : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message = typeof error.data === "string" ? error.data : "You don't have permission to edit this lesson.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/instructor">
            <Button variant="outline">My Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

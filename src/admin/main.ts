import { REPO } from "@/data/site.config";
import { FrontmatterError, parsePost, serializePost, type FrontmatterData } from "@/lib/frontmatter";
import { auditPost, hasErrors, POST_LIMITS, slugify, toOffsetIsoString, type Finding } from "@/lib/post-rules";
import { getReadingMinutes } from "@/lib/reading-time";
import { bytesToBase64 } from "@/lib/encoding";
import { GitHubClient, GitHubError, type RemoteFile } from "./github";
import { formatBytes, ImageRejected, prepareImage, type PreparedImage } from "./images";
import katexStylesheet from "katex/dist/katex.min.css?url";

// Refuse to run framed: the page holds a write token (clickjacking guard;
// GitHub Pages can't send frame-ancestors / X-Frame-Options headers).
if (window.top !== window.self) {
  document.body.textContent = "";
  throw new Error("admin must not be framed");
}

const TOKEN_KEY = "blog-admin:token";
const AUTOSAVE_PREFIX = "blog-admin:autosave:";
const SITE_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── DOM ─────────────────────────────────────────────────────────────── */

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing`);
  return el as T;
}

const views = {
  login: $("view-login"),
  list: $("view-list"),
  editor: $("view-editor"),
};

const ui = {
  loginForm: $<HTMLFormElement>("login-form"),
  tokenInput: $<HTMLInputElement>("token-input"),
  rememberInput: $<HTMLInputElement>("remember-input"),
  loginStatus: $("login-status"),
  whoami: $("whoami"),
  logoutBtn: $<HTMLButtonElement>("logout-btn"),
  newBtn: $<HTMLButtonElement>("new-btn"),
  refreshBtn: $<HTMLButtonElement>("refresh-btn"),
  filterInput: $<HTMLInputElement>("filter-input"),
  listStatus: $("list-status"),
  postList: $<HTMLUListElement>("post-list"),
  editorHeading: $("editor-heading"),
  backBtn: $<HTMLButtonElement>("back-btn"),
  form: $<HTMLFormElement>("editor-form"),
  title: $<HTMLInputElement>("ed-title"),
  slugField: $("slug-field"),
  slug: $<HTMLInputElement>("ed-slug"),
  desc: $<HTMLTextAreaElement>("ed-desc"),
  tags: $<HTMLInputElement>("ed-tags"),
  pubDate: $<HTMLInputElement>("ed-pubdate"),
  draft: $<HTMLInputElement>("ed-draft"),
  verified: $<HTMLInputElement>("ed-verified"),
  featured: $<HTMLInputElement>("ed-featured"),
  math: $<HTMLInputElement>("ed-math"),
  touchUpdated: $<HTMLInputElement>("ed-touch-updated"),
  touchUpdatedWrap: $("touch-updated-wrap"),
  imageGroup: $<HTMLDetailsElement>("image-group"),
  imageUrl: $<HTMLInputElement>("ed-image-url"),
  imageAlt: $<HTMLInputElement>("ed-image-alt"),
  body: $<HTMLTextAreaElement>("ed-body"),
  bodyStats: $("body-stats"),
  imageBtn: $<HTMLButtonElement>("image-btn"),
  imageInput: $<HTMLInputElement>("image-input"),
  pendingImages: $("pending-images"),
  auditSummary: $("audit-summary"),
  auditList: $<HTMLUListElement>("audit-list"),
  editorStatus: $("editor-status"),
  deleteBtn: $<HTMLButtonElement>("delete-btn"),
  previewBtn: $<HTMLButtonElement>("preview-btn"),
  saveBtn: $<HTMLButtonElement>("save-btn"),
  previewDialog: $<HTMLDialogElement>("preview-dialog"),
  previewFrame: $<HTMLIFrameElement>("preview-frame"),
  previewClose: $<HTMLButtonElement>("preview-close"),
};

type Tone = "info" | "error" | "success";
function setStatus(el: HTMLElement, message: string, tone: Tone = "info") {
  el.textContent = message;
  el.dataset["tone"] = tone;
}

function show(view: keyof typeof views) {
  for (const [name, el] of Object.entries(views)) el.hidden = name !== view;
  document.title = { login: "로그인", list: "글 목록", editor: "글 편집" }[view] + " · 블로그 관리";
  window.scrollTo(0, 0);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(node, rest);
  if (dataset) Object.assign(node.dataset, dataset);
  for (const child of children) if (child) node.append(child);
  return node;
}

/* ── Session ─────────────────────────────────────────────────────────── */

function storedToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string, remember: boolean) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    if (remember) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the token lives in memory for this tab only */
  }
}

function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

let client: GitHubClient | null = null;

async function signIn(token: string, remember: boolean): Promise<boolean> {
  const candidate = new GitHubClient(token, REPO);
  try {
    const me = await candidate.whoAmI();
    if (!me.canWrite) {
      setStatus(ui.loginStatus, `${me.login} 계정은 ${REPO.owner}/${REPO.name}에 쓰기 권한이 없습니다.`, "error");
      return false;
    }
    client = candidate;
    storeToken(token, remember);
    ui.whoami.textContent = `${me.login} · ${REPO.owner}/${REPO.name}@${REPO.branch}`;
    return true;
  } catch (error) {
    setStatus(ui.loginStatus, errorMessage(error), "error");
    if (error instanceof GitHubError && error.isAuth) clearToken();
    return false;
  }
}

function signOut() {
  if (!confirmDiscard()) return;
  clearToken();
  client = null;
  posts = [];
  ui.tokenInput.value = "";
  setStatus(ui.loginStatus, "");
  show("login");
}

ui.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = ui.tokenInput.value.trim();
  if (!token) {
    ui.tokenInput.focus();
    setStatus(ui.loginStatus, "토큰을 입력하세요.", "error");
    return;
  }
  setStatus(ui.loginStatus, "확인 중…");
  if (await signIn(token, ui.rememberInput.checked)) {
    ui.tokenInput.value = "";
    await openList();
  }
});

ui.logoutBtn.addEventListener("click", signOut);

/* ── Post list ───────────────────────────────────────────────────────── */

interface PostSummary {
  file: RemoteFile;
  title: string;
  pubDate: string;
  tags: string[];
  draft: boolean;
  findings: Finding[];
}

let posts: PostSummary[] = [];

function summarize(file: RemoteFile): PostSummary {
  let data: FrontmatterData = {};
  try {
    data = parsePost(file.text).data;
  } catch {
    /* audit reports the parse error */
  }
  return {
    file,
    title: typeof data["title"] === "string" ? data["title"] : file.name,
    pubDate: typeof data["pubDate"] === "string" ? data["pubDate"] : "",
    tags: Array.isArray(data["tags"]) ? data["tags"].map(String) : [],
    draft: data["draft"] === true,
    findings: auditPost(file.text, { base: SITE_BASE }),
  };
}

async function openList() {
  if (!client) return show("login");
  show("list");
  setStatus(ui.listStatus, "불러오는 중…");
  ui.postList.replaceChildren();
  try {
    const files = await client.listFiles(REPO.contentDir);
    posts = files
      .filter((file) => /\.mdx?$/.test(file.name) && !file.name.startsWith("_"))
      .map(summarize)
      .sort((a, b) => b.pubDate.localeCompare(a.pubDate));
    setStatus(ui.listStatus, posts.length ? `${posts.length}개의 글` : "");
    renderList();
  } catch (error) {
    handleError(error, ui.listStatus);
  }
}

function renderList() {
  const query = ui.filterInput.value.trim().toLowerCase();
  const visible = posts.filter(
    (post) =>
      !query ||
      post.title.toLowerCase().includes(query) ||
      post.tags.some((tag) => tag.toLowerCase().includes(query)) ||
      post.file.name.toLowerCase().includes(query),
  );
  if (visible.length === 0) {
    ui.postList.replaceChildren(el("li", { className: "empty" }, query ? "찾는 글이 없습니다." : "아직 글이 없습니다."));
    return;
  }
  ui.postList.replaceChildren(
    ...visible.map((post) => {
      const errors = post.findings.filter((f) => f.severity === "error").length;
      const warnings = post.findings.length - errors;
      return el(
        "li",
        { className: "post-row" },
        el(
          "button",
          { type: "button", className: "post-open", dataset: { path: post.file.path } },
          el("div", { className: "post-name" }, post.title),
          el(
            "div",
            { className: "post-meta" },
            post.draft
              ? el("span", { className: "badge badge-draft" }, "초안")
              : el("span", { className: "badge badge-live" }, "발행"),
            errors > 0 && el("span", { className: "badge badge-error" }, `오류 ${errors}`),
            warnings > 0 && el("span", { className: "badge badge-warn" }, `확인 ${warnings}`),
            post.pubDate && el("time", { dateTime: post.pubDate }, post.pubDate.slice(0, 16).replace("T", " ")),
            el("span", {}, post.file.name),
          ),
        ),
      );
    }),
  );
}

ui.postList.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(".post-open");
  const path = button?.dataset["path"];
  if (path) void openEditor(path);
});
ui.filterInput.addEventListener("input", renderList);
ui.refreshBtn.addEventListener("click", () => void openList());
ui.newBtn.addEventListener("click", () => void openEditor(null));

/* ── Editor ──────────────────────────────────────────────────────────── */

interface EditorState {
  /** null for a post that doesn't exist on GitHub yet. */
  path: string | null;
  sha: string | null;
  /** Frontmatter as loaded; unknown keys are written back untouched. */
  original: FrontmatterData;
  /** Serialized post at load time, to detect unsaved changes. */
  baseline: string;
  slugTouched: boolean;
}

let editor: EditorState | null = null;

function autosaveKey(path: string | null) {
  return AUTOSAVE_PREFIX + (path ?? "new");
}

function readAutosave(path: string | null): { text: string; at: number } | null {
  try {
    const raw = localStorage.getItem(autosaveKey(path));
    return raw ? (JSON.parse(raw) as { text: string; at: number }) : null;
  } catch {
    return null;
  }
}

function writeAutosave(path: string | null, text: string) {
  try {
    localStorage.setItem(autosaveKey(path), JSON.stringify({ text, at: Date.now() }));
  } catch {
    /* quota or privacy mode: autosave is best effort */
  }
}

function clearAutosave(path: string | null) {
  try {
    localStorage.removeItem(autosaveKey(path));
  } catch {
    /* ignore */
  }
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function fillForm(data: FrontmatterData, body: string) {
  const str = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
  ui.title.value = str("title");
  ui.desc.value = str("description");
  ui.tags.value = Array.isArray(data["tags"]) ? data["tags"].join(", ") : "";
  ui.pubDate.value = toLocalInput(str("pubDate"));
  ui.pubDate.dataset["original"] = str("pubDate");
  ui.draft.checked = data["draft"] === true;
  ui.verified.checked = data["verified"] === true;
  ui.featured.checked = data["featured"] === true;
  ui.math.checked = data["math"] === true;
  const image = data["image"];
  const imageObj = image && typeof image === "object" && !Array.isArray(image) ? image : null;
  ui.imageUrl.value = imageObj && typeof imageObj["url"] === "string" ? imageObj["url"] : "";
  ui.imageAlt.value = imageObj && typeof imageObj["alt"] === "string" ? imageObj["alt"] : "";
  ui.imageGroup.open = Boolean(ui.imageUrl.value);
  ui.body.value = body.replace(/^\n+/, "");
}

/** Build the post exactly as it would be committed. */
function composePost(now = new Date()): { text: string; slug: string } {
  if (!editor) throw new Error("editor is closed");
  const tags = ui.tags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  // Keep the author's original string (and its offset) unless the instant
  // actually changed. Compare instants, not strings: browsers normalise
  // datetime-local values (e.g. drop ":00" seconds).
  const originalPub = ui.pubDate.dataset["original"] ?? "";
  const picked = ui.pubDate.value ? new Date(ui.pubDate.value) : null;
  const sameInstant =
    originalPub !== "" &&
    picked !== null &&
    Math.floor(new Date(originalPub).valueOf() / 1000) === Math.floor(picked.valueOf() / 1000);
  const pubDate = sameInstant
    ? originalPub
    : picked && !Number.isNaN(picked.valueOf())
      ? toOffsetIsoString(picked)
      : originalPub || toOffsetIsoString(now);

  const data: FrontmatterData = {
    ...editor.original,
    title: ui.title.value.trim(),
    description: ui.desc.value.trim().replace(/\s*\n\s*/g, " "),
    pubDate,
    tags,
    draft: ui.draft.checked,
    verified: ui.verified.checked,
    featured: ui.featured.checked,
    math: ui.math.checked,
  };

  if (editor.path && ui.touchUpdated.checked && !ui.touchUpdatedWrap.hidden) {
    data["updatedDate"] = toOffsetIsoString(now);
  }

  const imageUrl = ui.imageUrl.value.trim();
  const imageAlt = ui.imageAlt.value.trim();
  if (imageUrl || imageAlt) data["image"] = { url: imageUrl, alt: imageAlt };
  else delete data["image"];

  const slug = editor.path ? "" : ui.slug.value.trim();
  return { text: serializePost(data, ui.body.value), slug };
}

function targetPath(slug: string): string {
  return `${REPO.contentDir}/${slug}.mdx`;
}

function isDirty(): boolean {
  if (!editor || views.editor.hidden) return false;
  // Compare without the volatile updatedDate the save would stamp.
  return composeForCompare() !== editor.baseline;
}

function composeForCompare(): string {
  if (!editor) return "";
  const touched = ui.touchUpdated.checked;
  ui.touchUpdated.checked = false;
  const { text } = composePost(new Date(0));
  ui.touchUpdated.checked = touched;
  return text;
}

function confirmDiscard(): boolean {
  return !isDirty() || confirm("저장하지 않은 변경 사항이 있습니다. 나가시겠습니까?");
}

async function openEditor(path: string | null) {
  if (!client) return show("login");
  if (!confirmDiscard()) return;

  let remote: RemoteFile | null = null;
  if (path) {
    setStatus(ui.listStatus, "글을 불러오는 중…");
    try {
      remote = await client.getFile(path);
    } catch (error) {
      handleError(error, ui.listStatus);
      return;
    }
    if (!remote) {
      setStatus(ui.listStatus, "GitHub에서 파일을 찾을 수 없습니다. 목록을 새로고침하세요.", "error");
      return;
    }
    setStatus(ui.listStatus, "");
  }

  let data: FrontmatterData;
  let body: string;
  if (remote) {
    try {
      ({ data, body } = parsePost(remote.text));
    } catch (error) {
      const reason = error instanceof FrontmatterError ? error.message : String(error);
      setStatus(ui.listStatus, `frontmatter를 읽을 수 없습니다 (${reason}). 저장소에서 직접 고쳐 주세요.`, "error");
      return;
    }
  } else {
    data = {
      title: "",
      description: "",
      pubDate: toOffsetIsoString(),
      tags: [],
      draft: true,
      verified: false,
      featured: false,
      math: false,
    };
    body = "";
  }

  editor = { path, sha: remote?.sha ?? null, original: data, baseline: "", slugTouched: false };
  pending.clear();
  renderPending();
  fillForm(data, body);
  ui.slug.value = "";
  ui.slugField.hidden = Boolean(path);
  ui.deleteBtn.hidden = !path;
  ui.touchUpdatedWrap.hidden = !path;
  ui.touchUpdated.checked = Boolean(path) && data["draft"] !== true;
  ui.editorHeading.textContent = path ? "글 수정" : "새 글";
  setStatus(ui.editorStatus, "");
  editor.baseline = composeForCompare();

  const saved = readAutosave(path);
  if (saved && saved.text !== editor.baseline) {
    const when = new Date(saved.at).toLocaleString("ko-KR");
    if (confirm(`${when}에 자동 저장된 내용이 있습니다. 불러올까요?`)) {
      try {
        const restored = parsePost(saved.text);
        fillForm({ ...data, ...restored.data }, restored.body);
        setStatus(ui.editorStatus, "자동 저장본을 불러왔습니다. 아직 GitHub에는 저장되지 않았습니다.");
      } catch {
        setStatus(ui.editorStatus, "자동 저장본이 손상되어 불러오지 못했습니다.", "error");
      }
    } else {
      clearAutosave(path);
    }
  }

  show("editor");
  refreshEditor();
  ui.title.focus();
}

ui.backBtn.addEventListener("click", () => {
  if (!confirmDiscard()) return;
  if (editor) clearAutosave(editor.path);
  editor = null;
  void openList();
});

/* Live feedback: counters, slug, audit, autosave. */

function updateCounter(input: HTMLInputElement | HTMLTextAreaElement, min: number, max: number) {
  const counter = document.querySelector<HTMLElement>(`[data-counter-for="${input.id}"]`);
  if (!counter) return;
  const length = input.value.trim().length;
  counter.textContent = `${length} / ${min}–${max}`;
  counter.classList.toggle("over", length > 0 && (length < min || length > max));
}

let autosaveTimer = 0;

function refreshEditor() {
  if (!editor) return;
  updateCounter(ui.title, POST_LIMITS.title.min, POST_LIMITS.title.max);
  updateCounter(ui.desc, POST_LIMITS.description.min, POST_LIMITS.description.max);

  if (!editor.path && !editor.slugTouched) ui.slug.value = slugify(ui.title.value);

  const body = ui.body.value;
  ui.bodyStats.textContent = `${body.length.toLocaleString("ko-KR")}자 · 약 ${getReadingMinutes(body)}분`;
  renderPending();

  const { text } = composePost();
  const findings = [...auditPost(text, { base: SITE_BASE }), ...slugFindings()];
  renderAudit(findings);

  window.clearTimeout(autosaveTimer);
  const path = editor.path;
  autosaveTimer = window.setTimeout(() => {
    if (isDirty()) writeAutosave(path, text);
  }, 800);
}

function slugFindings(): Finding[] {
  if (!editor || editor.path) return [];
  const slug = ui.slug.value.trim();
  const finding = (message: string): Finding => ({ severity: "error", line: 0, rule: "slug", message });
  if (!slug) return [finding("주소(slug)가 비어 있습니다. 한글·영문·숫자가 필요합니다.")];
  if (slug !== slugify(slug)) return [finding("주소에는 소문자, 숫자, 한글, 하이픈만 쓸 수 있습니다.")];
  if (posts.some((post) => post.file.path === targetPath(slug))) {
    return [finding("같은 주소의 글이 이미 있습니다.")];
  }
  return [];
}

function renderAudit(findings: Finding[]) {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  ui.auditSummary.textContent =
    findings.length === 0 ? "문제 없음" : `오류 ${errors}개 · 확인 ${warnings}개`;
  ui.slug.setAttribute("aria-invalid", String(findings.some((f) => f.rule === "slug")));
  ui.auditList.replaceChildren(
    ...findings.map((f) =>
      el(
        "li",
        { dataset: { severity: f.severity } },
        f.line > 0 ? el("span", { className: "line" }, `${f.line}행`) : null,
        f.message,
      ),
    ),
  );
}

ui.form.addEventListener("input", (event) => {
  if (event.target === ui.slug && editor) editor.slugTouched = true;
  refreshEditor();
});
ui.form.addEventListener("submit", (event) => event.preventDefault());

/* Images: paste, drop or pick; resized to WebP in the browser and
   committed together with the post on save. */

const pending = new Map<string, PreparedImage>();

function imageFolder(): string {
  if (editor?.path) return editor.path.split("/").pop()?.replace(/\.mdx?$/, "") ?? "drafts";
  return ui.slug.value.trim() || "drafts";
}

function referencedPending(text: string): PreparedImage[] {
  return [...pending.values()].filter((image) => text.includes(image.url));
}

function renderPending() {
  const count = referencedPending(ui.body.value).length;
  ui.pendingImages.textContent = count ? `저장할 때 함께 올릴 이미지 ${count}개` : "";
}

/** Insert text at the caret, keeping the browser's undo history. */
function insertText(textarea: HTMLTextAreaElement, text: string, selectStart?: number, selectEnd?: number) {
  textarea.focus();
  const start = textarea.selectionStart;
  // execCommand keeps Ctrl+Z working in a textarea; setRangeText is the fallback.
  if (!document.execCommand("insertText", false, text)) {
    textarea.setRangeText(text, start, textarea.selectionEnd, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (selectStart !== undefined) textarea.setSelectionRange(start + selectStart, start + (selectEnd ?? selectStart));
}

async function addImages(files: Iterable<File>) {
  if (!editor) return;
  const list = [...files].filter((file) => file.type.startsWith("image/") || /\.svg$/i.test(file.name));
  if (list.length === 0) return;
  for (const file of list) {
    setStatus(ui.editorStatus, `${file.name} 처리 중…`);
    try {
      const image = await prepareImage(file, imageFolder(), SITE_BASE);
      pending.set(image.url, image);
      // Own paragraph, caret inside the empty alt text: the audit flags
      // images without alt until it is written.
      const before = ui.body.value.slice(0, ui.body.selectionStart);
      const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
      const snippet = `${lead}![](${image.url})\n\n`;
      insertText(ui.body, snippet, lead.length + 2);
      const size =
        image.bytes.byteLength < image.originalBytes
          ? `${formatBytes(image.originalBytes)} → ${formatBytes(image.bytes.byteLength)}`
          : formatBytes(image.bytes.byteLength);
      setStatus(
        ui.editorStatus,
        `${file.name} 추가됨 (${image.width ? `${image.width}×${image.height}, ` : ""}${size}). [ ] 안에 이미지 설명(alt)을 적어 주세요.`,
        "success",
      );
    } catch (error) {
      setStatus(ui.editorStatus, error instanceof ImageRejected ? error.message : `이미지 처리 실패: ${errorMessage(error)}`, "error");
    }
  }
  refreshEditor();
}

ui.imageBtn.addEventListener("click", () => ui.imageInput.click());
ui.imageInput.addEventListener("change", () => {
  if (ui.imageInput.files) void addImages(ui.imageInput.files);
  ui.imageInput.value = "";
});

ui.body.addEventListener("paste", (event) => {
  const data = event.clipboardData;
  if (!data) return;
  const files = [...data.files].filter((file) => file.type.startsWith("image/"));
  if (files.length > 0) {
    event.preventDefault();
    void addImages(files);
    return;
  }
  // Pasting a URL over selected text makes a link, like GitHub does.
  const pasted = data.getData("text/plain").trim();
  const { selectionStart, selectionEnd, value } = ui.body;
  if (selectionStart !== selectionEnd && /^https?:\/\/\S+$/.test(pasted)) {
    event.preventDefault();
    insertText(ui.body, `[${value.slice(selectionStart, selectionEnd)}](${pasted})`);
  }
});

ui.body.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types.includes("Files")) {
    event.preventDefault();
    ui.body.classList.add("dragging");
  }
});
ui.body.addEventListener("dragleave", () => ui.body.classList.remove("dragging"));
ui.body.addEventListener("drop", (event) => {
  ui.body.classList.remove("dragging");
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    event.preventDefault();
    void addImages(files);
  }
});

/* Formatting shortcuts: ⌘/Ctrl + B, I, K wrap the selection. */

function wrapSelection(before: string, after: string, placeholder: string) {
  const { selectionStart, selectionEnd, value } = ui.body;
  const selected = value.slice(selectionStart, selectionEnd) || placeholder;
  insertText(ui.body, `${before}${selected}${after}`, before.length, before.length + selected.length);
}

ui.body.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
  const key = event.key.toLowerCase();
  if (key === "b") wrapSelection("**", "**", "굵게");
  else if (key === "i") wrapSelection("*", "*", "기울임");
  else if (key === "k") {
    const { selectionStart, selectionEnd, value } = ui.body;
    const text = value.slice(selectionStart, selectionEnd) || "링크 텍스트";
    const url = "https://";
    // Select the URL part so it can be typed over straight away.
    insertText(ui.body, `[${text}](${url})`, text.length + 3, text.length + 3 + url.length);
  } else return;
  event.preventDefault();
});

/* Save / delete */

let saving = false;

async function save() {
  if (!client || !editor || saving) return;
  const { text, slug } = composePost();
  const findings = [...auditPost(text, { base: SITE_BASE }), ...slugFindings()];
  if (hasErrors(findings)) {
    renderAudit(findings);
    setStatus(ui.editorStatus, "점검 오류를 먼저 고쳐 주세요. 그대로 커밋하면 배포가 실패합니다.", "error");
    return;
  }

  const path = editor.path ?? targetPath(slug);
  const title = ui.title.value.trim();
  saving = true;
  ui.saveBtn.disabled = true;
  setStatus(ui.editorStatus, "GitHub에 저장하는 중…");
  try {
    // Images first: if one fails, the post isn't committed pointing at a
    // file that doesn't exist. Only images still referenced are uploaded.
    const images = referencedPending(text);
    for (const [index, image] of images.entries()) {
      setStatus(ui.editorStatus, `이미지 올리는 중… (${index + 1}/${images.length})`);
      try {
        await client.putBinary(image.repoPath, image.bytes, `Add image: ${image.repoPath.split("/").pop()} (${title})`);
      } catch (error) {
        // Content-addressed names: an existing file is this exact image.
        if (!(error instanceof GitHubError && error.status === 422)) throw error;
      }
      pending.delete(image.url);
      renderPending();
    }
    setStatus(ui.editorStatus, "글을 저장하는 중…");
    const result = await client.putFile(
      path,
      text,
      editor.path ? `Update: ${title}` : `New post: ${title}`,
      editor.sha ?? undefined,
    );
    clearAutosave(editor.path);
    const created = !editor.path;
    editor.path = path;
    editor.sha = result.sha;
    editor.original = parsePost(text).data;
    ui.pubDate.dataset["original"] = String(editor.original["pubDate"] ?? "");
    editor.baseline = composeForCompare();
    ui.slugField.hidden = true;
    ui.deleteBtn.hidden = false;
    ui.touchUpdatedWrap.hidden = false;
    ui.editorHeading.textContent = "글 수정";

    const summary = summarize({ path, name: path.split("/").pop() ?? path, sha: result.sha, text });
    posts = [summary, ...posts.filter((post) => post.file.path !== path)];

    const isDraft = ui.draft.checked;
    setStatus(
      ui.editorStatus,
      `${created ? "만들었습니다" : "저장했습니다"}. ${isDraft ? "초안이라 사이트에는 보이지 않습니다." : `배포가 끝나면 ${SITE_BASE}/${path.split("/").pop()?.replace(/\.mdx?$/, "")}/ 에 반영됩니다.`}`,
      "success",
    );
  } catch (error) {
    handleError(error, ui.editorStatus);
  } finally {
    saving = false;
    ui.saveBtn.disabled = false;
  }
}

async function remove() {
  if (!client || !editor?.path || !editor.sha) return;
  const title = ui.title.value.trim() || editor.path;
  const typed = prompt(`삭제하려면 글 제목을 그대로 입력하세요:\n${title}`);
  if (typed === null) return;
  if (typed.trim() !== title) {
    setStatus(ui.editorStatus, "제목이 일치하지 않아 삭제하지 않았습니다.", "error");
    return;
  }
  ui.deleteBtn.disabled = true;
  try {
    await client.deleteFile(editor.path, editor.sha, `Delete: ${title}`);
    clearAutosave(editor.path);
    editor = null;
    await openList();
    setStatus(ui.listStatus, `“${title}” 글을 삭제했습니다.`, "success");
  } catch (error) {
    handleError(error, ui.editorStatus);
  } finally {
    ui.deleteBtn.disabled = false;
  }
}

ui.saveBtn.addEventListener("click", () => void save());
ui.deleteBtn.addEventListener("click", () => void remove());

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && !views.editor.hidden) {
    event.preventDefault();
    void save();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (isDirty()) event.preventDefault();
});

/* Preview: rendered in a sandboxed iframe (no scripts, opaque origin). */

const PREVIEW_STYLE = `
  body{margin:0;padding:2rem 1.5rem;background:#08080a;color:#e4e0d9;font:17px/1.85 "Pretendard Variable",system-ui,sans-serif;word-break:keep-all}
  main{max-width:720px;margin:0 auto}
  h1,h2,h3,h4{font-family:Georgia,serif;line-height:1.3;margin:2.2rem 0 1rem}
  h2{border-bottom:1px solid #1a1a1e;padding-bottom:.5rem}
  a{color:#e8a849}strong{color:#e8a849}
  code{font-family:ui-monospace,monospace;font-size:.85em;background:#111114;border:1px solid #1a1a1e;border-radius:.3rem;padding:.15em .4em}
  pre{background:#111114;border:1px solid #1a1a1e;border-radius:.5rem;padding:1rem;overflow:auto}pre code{border:0;padding:0}
  blockquote{margin:2rem 0;padding:.8rem 1.4rem;border-left:2px solid #e8a849;background:rgba(232,168,73,.07);color:#9b968f}
  table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #1a1a1e;padding:.6rem .8rem;text-align:left}
  img{max-width:100%;height:auto;border-radius:.6rem}hr{border:0;height:1px;background:#1a1a1e;margin:3rem 0}
  .lede{color:#9b968f}figure{margin:2rem 0}figcaption{text-align:center;font-size:.85rem;color:#85807a}
  .math-display{overflow-x:auto;margin:1.5rem 0}
  .callout{margin:2rem 0;padding:1rem 1.25rem;border-left:3px solid #e8a849;border-radius:.5rem;background:rgba(232,168,73,.06)}
  .callout strong{display:block;font-size:.8rem}.callout-note{border-color:#7aa2f7}.callout-tip{border-color:#73c991}.callout-danger{border-color:#f7768e}`;

/** Approximate the MDX components so the preview reads like the post. */
function previewMdx(markdown: string): string {
  const attr = (attrs: string, name: string) => attrs.match(new RegExp(`${name}=["']([^"']*)["']`))?.[1] ?? "";
  return markdown
    .replace(/^(?:import|export)\s.*$/gm, "")
    .replace(/<Callout\b([^>]*)>/g, (_, attrs: string) => {
      const type = attr(attrs, "type") || "note";
      const title = attr(attrs, "title") || { note: "참고", tip: "팁", warning: "주의", danger: "경고" }[type] || "참고";
      return `<div class="callout callout-${type}"><strong>${title}</strong>\n\n`;
    })
    .replace(/<\/Callout>/g, "\n\n</div>")
    .replace(/<Figure\b([^>]*?)\/>/g, (_, attrs: string) =>
      `<figure><img src="${attr(attrs, "src")}" alt="${attr(attrs, "alt")}"><figcaption>${attr(attrs, "caption")}</figcaption></figure>`,
    );
}

async function openPreview() {
  const [{ Marked }, { default: katex }] = await Promise.all([import("marked"), import("katex")]);
  const title = ui.title.value.trim() || "(제목 없음)";
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const tex = (source: string, displayMode: boolean) =>
    katex.renderToString(source, { displayMode, throwOnError: false, output: "html" });

  const marked = new Marked({ gfm: true });
  marked.use({
    extensions: [
      {
        name: "mathBlock",
        level: "block",
        start: (src: string) => src.indexOf("$$"),
        tokenizer(src: string) {
          const match = src.match(/^\$\$\s*\n?([\s\S]+?)\n?\s*\$\$(?:\n|$)/);
          return match ? { type: "mathBlock", raw: match[0], text: match[1] ?? "" } : undefined;
        },
        renderer: (token) => `<div class="math-display">${tex(String(token["text"]), true)}</div>`,
      },
      {
        name: "mathInline",
        level: "inline",
        start: (src: string) => src.indexOf("$"),
        tokenizer(src: string) {
          const match = src.match(/^\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/);
          return match ? { type: "mathInline", raw: match[0], text: match[1] ?? "" } : undefined;
        },
        renderer: (token) => tex(String(token["text"]), false),
      },
    ],
  });

  let html = await marked.parse(previewMdx(ui.body.value));
  // Images that exist only in this tab yet: show them from memory.
  for (const image of pending.values()) {
    html = html.split(`src="${image.url}"`).join(`src="data:${image.type};base64,${bytesToBase64(image.bytes)}"`);
  }
  const katexHref = new URL(katexStylesheet, location.href).href;
  ui.previewFrame.srcdoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="${katexHref}"><style>${PREVIEW_STYLE}</style></head><body><main><h1>${escape(title)}</h1><p class="lede">${escape(ui.desc.value)}</p>${html}</main></body></html>`;
  ui.previewDialog.showModal();
}

ui.previewBtn.addEventListener("click", () => void openPreview());
ui.previewClose.addEventListener("click", () => ui.previewDialog.close());

/* Errors */

function errorMessage(error: unknown): string {
  if (error instanceof GitHubError) return error.message;
  if (error instanceof TypeError) return "네트워크 오류: GitHub에 연결할 수 없습니다.";
  return error instanceof Error ? error.message : String(error);
}

function handleError(error: unknown, target: HTMLElement) {
  if (error instanceof GitHubError && error.isAuth) {
    clearToken();
    client = null;
    show("login");
    setStatus(ui.loginStatus, errorMessage(error), "error");
    return;
  }
  const hint =
    error instanceof GitHubError && error.isConflict
      ? " 작성 내용은 이 브라우저에 자동 저장되어 있으니, 목록에서 다시 열어 비교해 주세요."
      : "";
  setStatus(target, errorMessage(error) + hint, "error");
}

/* Boot */

void (async () => {
  const token = storedToken();
  let remembered = false;
  try {
    remembered = localStorage.getItem(TOKEN_KEY) !== null;
  } catch {
    /* ignore */
  }
  if (token && (await signIn(token, remembered))) {
    await openList();
  } else {
    show("login");
  }
})();

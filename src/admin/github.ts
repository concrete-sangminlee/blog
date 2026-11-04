import { utf8ToBase64 } from "@/lib/encoding";

/**
 * Minimal GitHub client for the admin. Reads go through GraphQL, which
 * returns every post's UTF-8 text and blob SHA in ONE request (the old
 * admin made 1 + N REST calls and decoded them with `atob`, corrupting
 * Korean). Writes use the REST contents API with the blob SHA as an
 * optimistic-concurrency token.
 */

const API = "https://api.github.com";

export interface RepoRef {
  owner: string;
  name: string;
  branch: string;
}

export interface RemoteFile {
  path: string;
  name: string;
  sha: string;
  text: string;
}

export class GitHubError extends Error {
  override name = "GitHubError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  get isAuth(): boolean {
    return this.status === 401;
  }

  /** The file changed on GitHub since we loaded it. */
  get isConflict(): boolean {
    return this.status === 409 || this.status === 422;
  }
}

export class GitHubClient {
  readonly #token: string;
  readonly #repo: RepoRef;

  constructor(token: string, repo: RepoRef) {
    this.#token = token;
    this.#repo = repo;
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.#token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new GitHubError(describeError(response, body), response.status);
    }
    return body as T;
  }

  async #graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const result = await this.#request<{ data?: T; errors?: { message: string; type?: string }[] }>(
      "/graphql",
      { method: "POST", body: JSON.stringify({ query, variables }) },
    );
    const first = result.errors?.[0];
    if (first) throw new GitHubError(first.message, first.type === "NOT_FOUND" ? 404 : 400);
    if (!result.data) throw new GitHubError("GitHub 응답이 비어 있습니다", 500);
    return result.data;
  }

  /** Who the token belongs to and whether it may push to the repo. */
  async whoAmI(): Promise<{ login: string; canWrite: boolean }> {
    const data = await this.#graphql<{
      viewer: { login: string };
      repository: { viewerPermission: string | null } | null;
    }>(
      `query($owner: String!, $name: String!) {
        viewer { login }
        repository(owner: $owner, name: $name) { viewerPermission }
      }`,
      { owner: this.#repo.owner, name: this.#repo.name },
    );
    const permission = data.repository?.viewerPermission ?? "";
    return {
      login: data.viewer.login,
      canWrite: ["ADMIN", "MAINTAIN", "WRITE"].includes(permission),
    };
  }

  /** Every file directly inside `dir`, with text, in a single request. */
  async listFiles(dir: string): Promise<RemoteFile[]> {
    const data = await this.#graphql<{
      repository: {
        object: {
          entries?: {
            name: string;
            path: string;
            oid: string;
            type: string;
            object: { text: string | null; isTruncated: boolean } | null;
          }[];
        } | null;
      } | null;
    }>(
      `query($owner: String!, $name: String!, $expr: String!) {
        repository(owner: $owner, name: $name) {
          object(expression: $expr) {
            ... on Tree {
              entries {
                name path oid type
                object { ... on Blob { text isTruncated } }
              }
            }
          }
        }
      }`,
      { owner: this.#repo.owner, name: this.#repo.name, expr: `${this.#repo.branch}:${dir}` },
    );
    const entries = data.repository?.object?.entries ?? [];
    return entries
      .filter((entry) => entry.type === "blob" && entry.object?.text != null && !entry.object.isTruncated)
      .map((entry) => ({
        path: entry.path,
        name: entry.name,
        sha: entry.oid,
        text: entry.object?.text ?? "",
      }));
  }

  /** One file's current text and SHA, or null when it does not exist. */
  async getFile(path: string): Promise<RemoteFile | null> {
    const data = await this.#graphql<{
      repository: { object: { oid: string; text: string | null } | null } | null;
    }>(
      `query($owner: String!, $name: String!, $expr: String!) {
        repository(owner: $owner, name: $name) {
          object(expression: $expr) { ... on Blob { oid text } }
        }
      }`,
      { owner: this.#repo.owner, name: this.#repo.name, expr: `${this.#repo.branch}:${path}` },
    );
    const object = data.repository?.object;
    if (!object || object.text == null) return null;
    return { path, name: path.split("/").pop() ?? path, sha: object.oid, text: object.text };
  }

  /**
   * Create (no `sha`) or update (with the `sha` that was loaded) a file.
   * GitHub rejects the write if the file changed in the meantime.
   */
  async putFile(path: string, text: string, message: string, sha?: string): Promise<{ sha: string; commitUrl: string }> {
    const result = await this.#request<{ content: { sha: string }; commit: { html_url: string } }>(
      `/repos/${this.#repo.owner}/${this.#repo.name}/contents/${encodePath(path)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message,
          content: utf8ToBase64(text),
          branch: this.#repo.branch,
          ...(sha ? { sha } : {}),
        }),
      },
    );
    return { sha: result.content.sha, commitUrl: result.commit.html_url };
  }

  async deleteFile(path: string, sha: string, message: string): Promise<void> {
    await this.#request(`/repos/${this.#repo.owner}/${this.#repo.name}/contents/${encodePath(path)}`, {
      method: "DELETE",
      body: JSON.stringify({ message, sha, branch: this.#repo.branch }),
    });
  }
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function describeError(response: Response, body: unknown): string {
  const message =
    body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message
      : `HTTP ${response.status}`;
  if (response.status === 401) return "토큰이 만료되었거나 올바르지 않습니다.";
  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    if (remaining === "0" && reset) {
      const at = new Date(Number(reset) * 1000).toLocaleTimeString("ko-KR");
      return `GitHub API 사용량 제한에 걸렸습니다. ${at} 이후 다시 시도하세요.`;
    }
    return `권한이 없습니다: ${message}`;
  }
  if (response.status === 409 || response.status === 422) {
    return `GitHub의 파일이 그사이 바뀌었거나 이미 존재합니다 (${message}).`;
  }
  return message;
}
